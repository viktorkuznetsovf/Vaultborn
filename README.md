# Vaultborn

**Privacy-Preserving ETH Staking Protocol with NFT-Based Certificates**

Vaultborn is a revolutionary decentralized staking protocol that leverages Fully Homomorphic Encryption (FHE) to enable confidential ETH staking. Users receive transferable NFT certificates representing their stakes, with the actual stake amounts encrypted on-chain and only decryptable by the stake owner.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Why Vaultborn](#why-vaultborn)
- [Technology Stack](#technology-stack)
- [How It Works](#how-it-works)
- [Problems Solved](#problems-solved)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Development Workflow](#development-workflow)
- [Smart Contract Details](#smart-contract-details)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security Considerations](#security-considerations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Resources](#resources)

## Overview

Vaultborn introduces a novel approach to decentralized staking by combining the transparency of blockchain technology with the privacy guarantees of Fully Homomorphic Encryption. The protocol allows users to:

1. **Stake ETH** and receive an NFT certificate representing their position
2. **Keep stake amounts private** through FHE encryption using Zama's FHEVM
3. **Maintain full control** with only the owner able to decrypt their stake amount
4. **Redeem stakes** by burning the NFT and triggering an oracle-based decryption process

## Key Features

### Privacy-First Design
- **Encrypted Balances**: All stake amounts are encrypted using Zama's FHEVM, ensuring on-chain privacy
- **Selective Disclosure**: Only the stake owner can decrypt and view their exact stake amount
- **Public Verifiability**: While amounts are private, the existence and validity of stakes are publicly verifiable

### NFT-Based Certificates
- **ERC-721 Compliance**: Each stake is represented by a standard ERC-721 NFT
- **Transferability**: Stake positions can be transferred between addresses via NFT transfers
- **Enumerable**: Built-in support for querying all tokens owned by an address
- **On-Chain Metadata**: Encrypted stake information stored directly on-chain

### Secure Withdrawal Mechanism
- **Oracle-Based Decryption**: Withdrawals utilize Zama's decryption oracle for secure revelation
- **Asynchronous Processing**: Withdrawal requests are processed asynchronously with request tracking
- **Automated Distribution**: ETH is automatically returned to the original staker upon successful decryption
- **Reentrancy Protection**: Comprehensive guards against reentrancy attacks

### Developer-Friendly
- **Comprehensive Testing**: Full test suite with mock and testnet support
- **Hardhat Integration**: Built on the industry-standard Hardhat development framework
- **TypeScript Support**: End-to-end TypeScript for type safety
- **Well-Documented**: Extensive inline documentation and NatSpec comments

## Why Vaultborn

### The Privacy Problem in DeFi

Traditional DeFi protocols operate with complete transparency—every transaction, balance, and position is publicly visible. While this transparency has benefits, it creates significant problems:

1. **Front-Running**: Large stake positions can be front-run by MEV bots
2. **Privacy Concerns**: Users' financial positions are exposed to competitors and observers
3. **Strategic Disadvantage**: Visible positions can be exploited in trading strategies
4. **Regulatory Concerns**: Complete transparency may conflict with privacy regulations

### Vaultborn's Solution

Vaultborn solves these problems by implementing **confidential staking** through Fully Homomorphic Encryption:

- **Hidden Amounts**: Stake quantities remain encrypted on-chain
- **Provable Ownership**: Users can prove ownership without revealing amounts
- **MEV Protection**: Encrypted balances prevent targeted front-running
- **Flexible Privacy**: Users control when and to whom they reveal their stakes

### Advantages Over Competitors

| Feature | Traditional Staking | Vaultborn |
|---------|-------------------|-----------|
| **Privacy** | All amounts public | Encrypted stake amounts |
| **Transferability** | Limited or none | Full NFT transferability |
| **On-Chain Verification** | Public balances | Encrypted proofs |
| **MEV Protection** | Vulnerable | Protected by encryption |
| **Composability** | Limited | Standard ERC-721 |
| **User Control** | Platform-dependent | Self-custodial |

## Technology Stack

### Smart Contract Layer
- **Solidity ^0.8.24**: Latest stable Solidity version with modern features
- **OpenZeppelin Contracts**: Battle-tested implementations of ERC-721, ReentrancyGuard
- **Zama FHEVM**: Fully Homomorphic Encryption for confidential on-chain computation
- **Hardhat**: Comprehensive Ethereum development environment

### Cryptography & Privacy
- **FHEVM Protocol**: Enables encrypted computation directly on Ethereum
- **Zama FHE Library**: Production-ready FHE implementation
- **Oracle-Based Decryption**: Secure off-chain decryption with on-chain verification
- **euint256**: Encrypted 256-bit unsigned integers for stake amounts

### Development & Testing
- **TypeScript**: Type-safe development across the entire stack
- **Ethers.js v6**: Modern Ethereum interaction library
- **Hardhat Plugins**: Deploy, verify, test, and type generation
- **Mocha + Chai**: Comprehensive testing framework

### Frontend (Planned)
- **React**: Modern UI component library
- **Vite**: Fast build tool and development server
- **Viem**: Type-safe Ethereum interactions
- **RainbowKit**: Best-in-class wallet connection
- **No Tailwind**: Custom styling for unique design

### Infrastructure
- **Infura**: Reliable Ethereum node infrastructure
- **Sepolia Testnet**: Primary testing network
- **Etherscan API**: Contract verification and exploration

## How It Works

### 1. Staking Process

```solidity
function stake() external payable returns (uint256 tokenId)
```

When a user stakes ETH:

1. User sends ETH transaction to the `stake()` function
2. Contract mints a new ERC-721 NFT to the user
3. Stake amount is encrypted using FHE: `euint256 encryptedAmount = FHE.asEuint256(msg.value)`
4. Encrypted amount is given permissions for both contract and user to access
5. NFT token ID is linked to the encrypted stake in contract storage
6. `StakeMinted` event is emitted with the encrypted amount

**Key Innovation**: The stake amount is encrypted using Zama's FHEVM, making it impossible for observers to determine the exact amount staked while maintaining verifiability.

### 2. Querying Stakes

```solidity
function getEncryptedStake(uint256 tokenId) external view returns (euint256)
```

Users can query their encrypted stakes:

1. Contract returns the encrypted stake handle (`euint256`)
2. User can decrypt locally using their private key and FHEVM client
3. Decryption happens client-side—no stake amount is revealed on-chain
4. Multiple convenience functions available: `tokensOf()`, `pendingRequestForToken()`

### 3. Redemption Process

```solidity
function redeem(uint256 tokenId) external returns (uint256 requestId)
```

The withdrawal process is a two-phase operation:

**Phase 1: Initiation**
1. User calls `redeem()` with their NFT token ID
2. Contract verifies ownership and burns the NFT
3. Encrypted stake is submitted to Zama's decryption oracle
4. A `requestId` is returned and linked to the pending withdrawal
5. `WithdrawRequested` event is emitted

**Phase 2: Fulfillment**
1. Zama oracle processes the decryption request off-chain
2. Oracle calls back `onDecryptionFulfilled()` with decrypted amount
3. Contract verifies the oracle signature and decryption proof
4. ETH is transferred to the original staker
5. `WithdrawCompleted` event is emitted with the revealed amount
6. Pending withdrawal state is cleaned up

### 4. Security Mechanisms

- **Reentrancy Guards**: All state-changing functions protected
- **Access Control**: Only NFT owners can redeem their stakes
- **Oracle Validation**: Decryption results cryptographically verified
- **Atomic Operations**: Critical state changes happen atomically
- **Event Logging**: Comprehensive event trail for auditing

## Problems Solved

### 1. Privacy in Public Blockchains

**Problem**: Ethereum and most blockchains are completely transparent. Every transaction, balance, and smart contract state is visible to everyone.

**Vaultborn Solution**: Uses Fully Homomorphic Encryption to keep stake amounts private while maintaining on-chain verifiability. Users can stake any amount without revealing it to observers, competitors, or potential attackers.

### 2. Non-Transferable Staking Positions

**Problem**: Most staking protocols lock funds in contracts without providing transferable representations of those positions.

**Vaultborn Solution**: Issues ERC-721 NFTs as stake certificates. These can be:
- Transferred to other addresses
- Used as collateral in other protocols (future)
- Traded on NFT marketplaces
- Integrated into broader DeFi ecosystems

### 3. MEV and Front-Running Risks

**Problem**: Visible large stakes attract MEV bots and can be front-run, disadvantaging stakers.

**Vaultborn Solution**: Encrypted amounts prevent MEV bots from identifying valuable targets. Attackers cannot determine stake sizes, eliminating size-based attack vectors.

### 4. Whale Watching and Privacy Leakage

**Problem**: Large holders ("whales") are constantly monitored, with their positions tracked across protocols.

**Vaultborn Solution**: Encrypted balances prevent whale watching. Even sophisticated chain analysis cannot determine actual stake amounts.

### 5. Complex Withdrawal Processes

**Problem**: Many staking protocols have complex, multi-step withdrawal processes that are error-prone.

**Vaultborn Solution**: Simple two-phase process:
1. Burn NFT (one transaction)
2. Oracle automatically processes and returns funds

### 6. Centralization in Staking

**Problem**: Many staking solutions require trusting centralized operators.

**Vaultborn Solution**:
- Self-custodial design
- Decentralized oracle network (Zama)
- On-chain verification of all operations
- No admin functions or centralized control

## Architecture

### Smart Contract Architecture

```
VaultbornStaking
├── Inheritance
│   ├── ERC721Enumerable (NFT functionality)
│   ├── SepoliaConfig (Zama FHEVM configuration)
│   └── ReentrancyGuard (Security)
│
├── State Variables
│   ├── _nextTokenId (NFT ID counter)
│   ├── _encryptedStakes (tokenId => encrypted amount)
│   ├── _pendingByRequest (requestId => withdrawal info)
│   ├── _requestByToken (tokenId => requestId)
│   └── _isTokenPending (tokenId => pending status)
│
├── External Functions
│   ├── stake() - Deposit ETH and mint NFT
│   ├── redeem() - Burn NFT and request withdrawal
│   ├── getEncryptedStake() - Query encrypted stake
│   ├── tokensOf() - List all tokens for address
│   ├── pendingRequestForToken() - Check pending requests
│   └── isTokenPending() - Check if withdrawal pending
│
└── Oracle Callback
    └── onDecryptionFulfilled() - Process oracle response
```

### Data Flow

```
Staking Flow:
User Wallet → stake() → Encrypt Amount → Mint NFT → Store Encrypted → Emit Event

Withdrawal Flow:
User Wallet → redeem() → Burn NFT → Request Decryption
    ↓
Oracle Decrypts → Callback → Verify Proof → Transfer ETH → Emit Event
```

### Encryption Model

```
Plaintext Amount (uint256)
    ↓ FHE.asEuint256()
Encrypted Amount (euint256)
    ↓ FHE.allowThis() + FHE.allow(user)
Stored with Permissions
    ↓ User decrypts locally
Private View for Owner
    ↓ Oracle decrypts on redemption
Public Revelation on Withdrawal
```

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 20 or higher
  ```bash
  node --version  # Should be >= 20.0.0
  ```

- **npm**: Version 7.0.0 or higher
  ```bash
  npm --version  # Should be >= 7.0.0
  ```

- **Git**: For cloning the repository
  ```bash
  git --version
  ```

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-org/vaultborn.git
   cd vaultborn
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

   This will install:
   - Hardhat and plugins
   - Zama FHEVM libraries
   - OpenZeppelin contracts
   - Testing frameworks
   - TypeScript and type definitions

3. **Verify installation**

   ```bash
   npm run compile
   ```

   You should see successful compilation of all contracts.

### Configuration

1. **Create environment file**

   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. **Configure environment variables**

   Edit `.env` and add your credentials:
   ```bash
   # Required for Sepolia deployment
   INFURA_API_KEY=your_infura_api_key_here
   PRIVATE_KEY=your_deployer_private_key_here

   # Optional for contract verification
   ETHERSCAN_API_KEY=your_etherscan_api_key_here

   # Optional for gas reporting
   REPORT_GAS=true
   ```

   **Security Note**: Never commit your `.env` file. It's already in `.gitignore`.

3. **Get test ETH for Sepolia**

   - Visit [Sepolia Faucet](https://sepoliafaucet.com/)
   - Enter your wallet address
   - Receive test ETH for deployment

### Development Workflow

#### Compile Contracts

```bash
npm run compile
```

This will:
- Compile all Solidity contracts
- Generate TypeScript types via TypeChain
- Create deployment artifacts

#### Run Tests

```bash
# Run all tests on local network
npm run test

# Run with gas reporting
REPORT_GAS=true npm run test

# Run tests on Sepolia testnet
npm run test:sepolia
```

#### Start Local Development Node

```bash
# Terminal 1: Start local FHEVM node
npm run chain

# Terminal 2: Deploy contracts
npm run deploy:localhost
```

#### Deploy to Sepolia

```bash
# Deploy contract
npm run deploy:sepolia

# Verify on Etherscan
npm run verify:sepolia
```

#### Code Quality

```bash
# Run linting (Solidity + TypeScript)
npm run lint

# Format code
npm run prettier:write

# Check formatting
npm run prettier:check
```

## Smart Contract Details

### VaultbornStaking.sol

**Location**: `contracts/VaultbornStaking.sol`

#### Constructor Parameters

```solidity
constructor(address oracleAddress, bool enforceOracle)
```

- `oracleAddress`: Zama decryption oracle address (use `address(0)` for auto-detection)
- `enforceOracle`: Whether to strictly enforce oracle sender validation

#### Key Functions

##### stake()
```solidity
function stake() external payable nonReentrant returns (uint256 tokenId)
```
- **Visibility**: External
- **Modifiers**: `payable`, `nonReentrant`
- **Parameters**: None (ETH sent via `msg.value`)
- **Returns**: Token ID of minted NFT
- **Emits**: `StakeMinted(address staker, uint256 tokenId, bytes32 encryptedAmount)`

##### getEncryptedStake()
```solidity
function getEncryptedStake(uint256 tokenId) external view returns (euint256)
```
- **Visibility**: External, View
- **Parameters**: `tokenId` - The NFT token ID
- **Returns**: Encrypted stake amount handle
- **Note**: Decrypt client-side using FHEVM SDK

##### tokensOf()
```solidity
function tokensOf(address account) external view returns (uint256[] memory)
```
- **Visibility**: External, View
- **Parameters**: `account` - Address to query
- **Returns**: Array of token IDs owned by address

##### redeem()
```solidity
function redeem(uint256 tokenId) external nonReentrant returns (uint256 requestId)
```
- **Visibility**: External
- **Modifiers**: `nonReentrant`
- **Parameters**: `tokenId` - The NFT to burn and redeem
- **Returns**: Decryption request ID
- **Emits**: `WithdrawRequested(address staker, uint256 tokenId, uint256 requestId)`
- **Requirements**:
  - Caller must own the token
  - Token must not have pending withdrawal

##### onDecryptionFulfilled()
```solidity
function onDecryptionFulfilled(
    uint256 requestId,
    bytes memory cleartexts,
    bytes memory decryptionProof
) external nonReentrant returns (bool)
```
- **Visibility**: External (called by oracle)
- **Modifiers**: `nonReentrant`
- **Parameters**:
  - `requestId`: The decryption request ID
  - `cleartexts`: ABI-encoded decrypted values
  - `decryptionProof`: Cryptographic proof of correct decryption
- **Returns**: `true` on success
- **Emits**: `WithdrawCompleted(address staker, uint256 tokenId, uint256 amount)`

#### Events

```solidity
event StakeMinted(address indexed staker, uint256 indexed tokenId, bytes32 encryptedAmount);
event WithdrawRequested(address indexed staker, uint256 indexed tokenId, uint256 requestId);
event WithdrawCompleted(address indexed staker, uint256 indexed tokenId, uint256 amount);
```

#### Storage Layout

```solidity
uint256 private _nextTokenId;  // Next NFT token ID
mapping(uint256 => euint256) private _encryptedStakes;  // Token => encrypted stake
mapping(uint256 => PendingWithdrawal) private _pendingByRequest;  // Request => withdrawal
mapping(uint256 => uint256) private _requestByToken;  // Token => request ID
mapping(uint256 => bool) private _isTokenPending;  // Token => pending status
```

## Testing

### Test Structure

```
test/
└── VaultbornStaking.ts     # Comprehensive test suite
```

### Running Tests

```bash
# Run all tests with local mock FHEVM
npm run test

# Run specific test file
npx hardhat test test/VaultbornStaking.ts

# Run with gas reporting
REPORT_GAS=true npm run test

# Run on Sepolia testnet
npm run test:sepolia
```

### Test Coverage

The test suite includes:

1. **Staking Tests**
   - Minting NFTs on stake
   - Storing encrypted amounts
   - Verifying contract balance
   - Checking token ownership

2. **Decryption Tests**
   - User can decrypt their own stakes
   - Others cannot decrypt
   - Encrypted values match original amounts

3. **Redemption Tests**
   - Successful withdrawal flow
   - Oracle callback processing
   - ETH transfer verification
   - State cleanup after withdrawal

4. **Security Tests**
   - Non-owners cannot redeem
   - Reentrancy protection
   - Double-redemption prevention
   - Oracle validation

5. **Edge Cases**
   - Zero stake prevention
   - Invalid token handling
   - Pending withdrawal conflicts

### Coverage Report

```bash
npm run coverage
```

This generates a detailed coverage report showing:
- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

## Deployment

### Local Deployment

1. **Start local node**
   ```bash
   npm run chain
   ```

2. **Deploy contracts**
   ```bash
   npm run deploy:localhost
   ```

### Sepolia Testnet Deployment

1. **Ensure you have Sepolia ETH**
   - Get from [Sepolia Faucet](https://sepoliafaucet.com/)

2. **Configure `.env`**
   ```bash
   INFURA_API_KEY=your_key
   PRIVATE_KEY=your_key
   ETHERSCAN_API_KEY=your_key
   ```

3. **Deploy**
   ```bash
   npm run deploy:sepolia
   ```

4. **Verify on Etherscan**
   ```bash
   npm run verify:sepolia
   ```

### Deployment Scripts

**Location**: `deploy/deploy.ts`

The deployment script:
- Detects the network
- Configures appropriate oracle address
- Deploys VaultbornStaking contract
- Saves deployment artifacts to `deployments/`
- Exports ABIs for frontend use

### Post-Deployment

After deployment:

1. **Verify contract address**
   ```bash
   npx hardhat run scripts/verify-deployment.ts --network sepolia
   ```

2. **Test basic functionality**
   ```bash
   npx hardhat test --network sepolia
   ```

3. **Note the contract address** from `deployments/sepolia/VaultbornStaking.json`

## Security Considerations

### Audit Status

**Current Status**: Unaudited

This protocol is currently in development and has not undergone professional security audits. **Do not use with real funds on mainnet**.

### Known Security Features

1. **Reentrancy Protection**
   - All state-changing functions use `nonReentrant` modifier
   - Checks-Effects-Interactions pattern followed

2. **Access Control**
   - NFT ownership verified before redemption
   - Oracle address validation (optional strict mode)

3. **Encryption Security**
   - Zama FHEVM provides cryptographic guarantees
   - Encrypted values never exposed in plaintext on-chain

4. **Oracle Security**
   - Decryption proofs cryptographically verified
   - KMS signatures validate oracle responses

### Potential Risks

1. **Oracle Dependency**
   - Withdrawals depend on Zama oracle availability
   - Oracle downtime could delay withdrawals
   - Mitigation: Oracle is decentralized and highly available

2. **Smart Contract Bugs**
   - As with all smart contracts, bugs may exist
   - Mitigation: Extensive testing, formal verification planned

3. **FHE Complexity**
   - FHE is cutting-edge cryptography
   - Mitigation: Built on Zama's production-tested libraries

4. **Gas Costs**
   - FHE operations are more expensive than regular operations
   - Mitigation: Optimized for minimal FHE operations

### Best Practices for Users

1. **Start Small**: Test with small amounts first
2. **Verify Contracts**: Always verify contract addresses
3. **Understand Risks**: This is experimental technology
4. **Backup Keys**: Never lose access to your wallet
5. **Monitor Withdrawals**: Track withdrawal request status

### Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public issue
2. Email security@vaultborn.io (if available)
3. Or create a private security advisory on GitHub
4. Include detailed reproduction steps

## Roadmap

### Phase 1: Core Protocol (Current)

- [x] VaultbornStaking smart contract
- [x] NFT-based stake certificates
- [x] FHE integration for encrypted balances
- [x] Oracle-based withdrawal mechanism
- [x] Comprehensive test suite
- [x] Sepolia deployment

### Phase 2: Frontend Development (Q2 2025)

- [ ] React-based web application
- [ ] Wallet connection (RainbowKit)
- [ ] Stake management interface
- [ ] Encrypted balance viewing
- [ ] Withdrawal tracking dashboard
- [ ] NFT gallery view
- [ ] Transaction history

### Phase 3: Enhanced Features (Q3 2025)

- [ ] Staking rewards system
- [ ] Multiple asset support (wBTC, wETH, stablecoins)
- [ ] Batch staking and redemption
- [ ] Advanced NFT metadata
- [ ] Stake splitting and merging
- [ ] Time-locked stakes with bonuses

### Phase 4: DeFi Integration (Q4 2025)

- [ ] Use stake NFTs as collateral
- [ ] Integration with lending protocols
- [ ] NFT marketplace listings
- [ ] Cross-chain staking (L2s)
- [ ] Governance token and DAO
- [ ] Stake delegation

### Phase 5: Mainnet & Scale (2026)

- [ ] Professional security audit
- [ ] Mainnet deployment
- [ ] Gas optimization
- [ ] Advanced encryption schemes
- [ ] Institutional features
- [ ] Mobile application

### Research & Innovation

- [ ] Zero-knowledge proof integration
- [ ] Threshold encryption for shared stakes
- [ ] Privacy-preserving reward distribution
- [ ] Advanced FHE operations
- [ ] Cross-protocol composability

## Contributing

We welcome contributions from the community! Here's how you can help:

### Ways to Contribute

1. **Code Contributions**
   - Bug fixes
   - Feature implementations
   - Test coverage improvements
   - Documentation updates

2. **Testing**
   - Report bugs
   - Test new features
   - Improve test coverage

3. **Documentation**
   - Fix typos
   - Improve clarity
   - Add examples
   - Translate documentation

4. **Community**
   - Help others in discussions
   - Share your use cases
   - Spread the word

### Development Process

1. **Fork the repository**
   ```bash
   git clone https://github.com/your-username/vaultborn.git
   cd vaultborn
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Write code
   - Add tests
   - Update documentation

4. **Test thoroughly**
   ```bash
   npm run test
   npm run lint
   npm run coverage
   ```

5. **Commit with clear messages**
   ```bash
   git commit -m "feat: add new staking feature"
   ```

6. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Standards

- Follow existing code style
- Write comprehensive tests
- Document all public functions
- Use TypeScript strict mode
- Follow Solidity style guide

### Commit Convention

We use conventional commits:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `test:` Test additions or modifications
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

## License

This project is licensed under the **BSD-3-Clause-Clear License**.

### What This Means

- You can use the code commercially
- You can modify the code
- You can distribute the code
- You must include the license and copyright notice
- You cannot use contributors' names for endorsement
- **Patent rights are explicitly NOT granted**

See the [LICENSE](LICENSE) file for full details.

## Resources

### Official Documentation

- **Vaultborn Docs**: Coming soon
- **FHEVM Documentation**: https://docs.zama.ai/fhevm
- **Zama Protocol Guides**: https://docs.zama.ai/protocol/solidity-guides
- **Hardhat Documentation**: https://hardhat.org/docs

### Zama Resources

- **FHEVM GitHub**: https://github.com/zama-ai/fhevm
- **FHEVM Hardhat Plugin**: https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat
- **Testing Guide**: https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat/write_test
- **Oracle Documentation**: https://docs.zama.ai/fhevm/guides/oracle

### Development Tools

- **OpenZeppelin Contracts**: https://docs.openzeppelin.com/contracts
- **Ethers.js Documentation**: https://docs.ethers.org/v6/
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/

### Community

- **Discord**: Coming soon
- **Twitter**: Coming soon
- **GitHub Discussions**: https://github.com/your-org/vaultborn/discussions
- **Zama Community**: https://discord.gg/zama

### Tutorials

- **Getting Started Guide**: docs/getting-started.md (coming soon)
- **Staking Tutorial**: docs/tutorials/staking.md (coming soon)
- **Frontend Integration**: docs/tutorials/frontend.md (coming soon)
- **Advanced Features**: docs/tutorials/advanced.md (coming soon)

### Example Projects

- **Vaultborn Frontend**: `home/` directory (in development)
- **Sample DApp**: Coming soon
- **Integration Examples**: Coming soon

## Acknowledgments

This project builds upon the incredible work of:

- **Zama**: For pioneering FHEVM and making FHE accessible
- **OpenZeppelin**: For battle-tested smart contract libraries
- **Hardhat**: For the best-in-class development framework
- **Ethereum Foundation**: For Sepolia testnet support

## Project Status

**Current Version**: 0.1.0 (Alpha)

**Status**: Active Development

**Last Updated**: January 2025

---

**Built with privacy and security in mind. Stake confidently with Vaultborn.**

For questions, issues, or contributions, please visit our [GitHub repository](https://github.com/your-org/vaultborn).
