// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FHE, euint256} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {SepoliaZamaOracleAddress} from "@zama-fhe/oracle-solidity/address/ZamaOracleAddress.sol";

/// @title VaultbornStaking
/// @notice Enables confidential ETH staking positions represented by NFTs.
/// @dev Each stake mints an ERC-721 token whose encrypted principal is stored using Zama FHE.
contract VaultbornStaking is ERC721Enumerable, SepoliaConfig, ReentrancyGuard {
    address public immutable decryptionOracle;
    bool public immutable enforceOracleCheck;
    struct PendingWithdrawal {
        address payable recipient;
        uint256 tokenId;
        bool exists;
    }

    uint256 private _nextTokenId = 1;
    mapping(uint256 => euint256) private _encryptedStakes;
    mapping(uint256 => PendingWithdrawal) private _pendingByRequest;
    mapping(uint256 => uint256) private _requestByToken;
    mapping(uint256 => bool) private _isTokenPending;

    event StakeMinted(address indexed staker, uint256 indexed tokenId, bytes32 encryptedAmount);
    event WithdrawRequested(address indexed staker, uint256 indexed tokenId, uint256 requestId);
    event WithdrawCompleted(address indexed staker, uint256 indexed tokenId, uint256 amount);

    constructor(address oracleAddress, bool enforceOracle) ERC721("Vaultborn Staked ETH", "VBST") {
        address targetOracle = oracleAddress == address(0) ? SepoliaZamaOracleAddress : oracleAddress;
        decryptionOracle = targetOracle;
        enforceOracleCheck = enforceOracle;
    }

    /// @notice Stake ETH and receive an NFT that confidentially tracks the deposit amount.
    /// @return tokenId The identifier of the minted staking certificate.
    function stake() external payable nonReentrant returns (uint256 tokenId) {
        require(msg.value > 0, "Stake must be greater than zero");

        tokenId = _nextTokenId;
        _nextTokenId = tokenId + 1;

        _safeMint(msg.sender, tokenId);

        euint256 encryptedAmount = FHE.asEuint256(msg.value);
        encryptedAmount = FHE.allowThis(encryptedAmount);
        encryptedAmount = FHE.allow(encryptedAmount, msg.sender);

        _encryptedStakes[tokenId] = encryptedAmount;
        _requestByToken[tokenId] = 0;
        _isTokenPending[tokenId] = false;

        emit StakeMinted(msg.sender, tokenId, FHE.toBytes32(encryptedAmount));
    }

    /// @notice Returns the encrypted stake amount linked to an NFT.
    /// @param tokenId The identifier of the staking certificate.
    /// @return The encrypted stake handle.
    function getEncryptedStake(uint256 tokenId) external view returns (euint256) {
        euint256 encryptedAmount = _encryptedStakes[tokenId];
        require(FHE.isInitialized(encryptedAmount), "Stake not found");
        return encryptedAmount;
    }

    /// @notice Lists all token identifiers owned by an account.
    /// @param account The address whose holdings are queried.
    /// @return tokenIds Array of token identifiers.
    function tokensOf(address account) external view returns (uint256[] memory tokenIds) {
        uint256 balance = balanceOf(account);
        tokenIds = new uint256[](balance);
        for (uint256 i = 0; i < balance; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(account, i);
        }
    }

    /// @notice Returns the active decryption request identifier for a token, if any.
    /// @param tokenId The identifier of the staking certificate.
    /// @return The pending request identifier or zero when none exists.
    function pendingRequestForToken(uint256 tokenId) external view returns (uint256) {
        if (!_isTokenPending[tokenId]) {
            return 0;
        }
        return _requestByToken[tokenId];
    }

    /// @notice Checks whether a token currently waits for a decryption response.
    /// @param tokenId The identifier of the staking certificate.
    /// @return True when a withdrawal request is pending.
    function isTokenPending(uint256 tokenId) external view returns (bool) {
        return _isTokenPending[tokenId];
    }

    /// @notice Burns a staking NFT and initiates the decryption of its principal to unlock withdrawal.
    /// @param tokenId The identifier of the staking certificate to redeem.
    /// @return requestId The identifier of the submitted decryption request.
    function redeem(uint256 tokenId) external nonReentrant returns (uint256 requestId) {
        address owner = _ownerOf(tokenId);
        require(owner != address(0), "Invalid token");
        require(_isAuthorized(owner, msg.sender, tokenId), "Not authorized");
        require(!_isTokenPending[tokenId], "Decryption pending");

        euint256 encryptedAmount = _encryptedStakes[tokenId];
        require(FHE.isInitialized(encryptedAmount), "Stake not found");

        address payable beneficiary = payable(owner);

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(encryptedAmount);

        _encryptedStakes[tokenId] = euint256.wrap(bytes32(0));
        _burn(tokenId);

        requestId = FHE.requestDecryption(ciphertexts, this.onDecryptionFulfilled.selector);

        _pendingByRequest[requestId] = PendingWithdrawal({recipient: beneficiary, tokenId: tokenId, exists: true});
        _requestByToken[tokenId] = requestId;
        _isTokenPending[tokenId] = true;

        emit WithdrawRequested(beneficiary, tokenId, requestId);
    }

    /// @notice Callback invoked by the Zama oracle once a decryption request is fulfilled.
    /// @param requestId Identifier of the completed decryption request.
    /// @param cleartexts ABI encoded decrypted values.
    /// @param decryptionProof KMS signatures proving correctness.
    /// @return Always true when the withdrawal succeeds.
    function onDecryptionFulfilled(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) external nonReentrant returns (bool) {
        if (enforceOracleCheck) {
            require(msg.sender == decryptionOracle, "Invalid oracle");
        }

        PendingWithdrawal memory pending = _pendingByRequest[requestId];
        require(pending.exists, "Unknown request");

        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        uint256 amount = abi.decode(cleartexts, (uint256));

        delete _pendingByRequest[requestId];
        _isTokenPending[pending.tokenId] = false;
        _requestByToken[pending.tokenId] = 0;

        (bool success, ) = pending.recipient.call{value: amount}("");
        require(success, "Transfer failed");

        emit WithdrawCompleted(pending.recipient, pending.tokenId, amount);
        return true;
    }
}
