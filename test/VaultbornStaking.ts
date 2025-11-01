import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { VaultbornStaking, VaultbornStaking__factory } from "../types";

const SEPOLIA_ORACLE = "0xa02Cda4Ca3a71D7C46997716F4283aa851C28812";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("VaultbornStaking")) as VaultbornStaking__factory;
  const oracleGetter = (fhevm as unknown as { getDecryptionOracleAddress?: () => Promise<string> })
    .getDecryptionOracleAddress;
  const oracleAddress = oracleGetter ? await oracleGetter.call(fhevm) : SEPOLIA_ORACLE;
  const stakingContract = (await factory.deploy(oracleAddress, false)) as VaultbornStaking;
  const stakingAddress = await stakingContract.getAddress();
  return { stakingContract, stakingAddress };
}

describe("VaultbornStaking", function () {
  let signers: Signers;
  let stakingContract: VaultbornStaking;
  let stakingAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
    await fhevm.initializeCLIApi();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    ({ stakingContract, stakingAddress } = await deployFixture());
  });

  it("mints an NFT and stores the encrypted stake", async function () {
    const stakeAmount = ethers.parseEther("1");

    const tx = await stakingContract.connect(signers.alice).stake({ value: stakeAmount });
    await tx.wait();

    const encryptedStake = await stakingContract.getEncryptedStake(1n);
    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint256,
      encryptedStake,
      stakingAddress,
      signers.alice,
    );

    expect(decrypted).to.equal(stakeAmount);

    const contractBalance = await ethers.provider.getBalance(stakingAddress);
    expect(contractBalance).to.equal(stakeAmount);

    const ownedTokens = await stakingContract.tokensOf(signers.alice.address);
    expect(ownedTokens.map(tokenId => tokenId.toString())).to.deep.equal(["1"]);
  });

  it("processes redemption and releases staked ETH after decryption", async function () {
    const stakeAmount = ethers.parseEther("0.75");

    await stakingContract.connect(signers.alice).stake({ value: stakeAmount });
    const redeemTx = await stakingContract.connect(signers.alice).redeem(1n);
    const redeemReceipt = await redeemTx.wait();

    const event = redeemReceipt?.logs
      .map(log => {
        try {
          return stakingContract.interface.parseLog(log);
        } catch (error) {
          return null;
        }
      })
      .find(parsed => parsed?.name === "WithdrawRequested");

    expect(event?.args?.requestId).to.not.be.undefined;

    await fhevm.awaitDecryptionOracle();

    const contractBalanceAfter = await ethers.provider.getBalance(stakingAddress);
    expect(contractBalanceAfter).to.equal(0);

    const completedEvents = await stakingContract.queryFilter(
      stakingContract.filters.WithdrawCompleted(signers.alice.address, null, null),
    );
    expect(completedEvents.length).to.be.greaterThan(0);
    const { amount } = completedEvents[completedEvents.length - 1].args;
    expect(amount).to.equal(stakeAmount);

    const pendingRequest = await stakingContract.pendingRequestForToken(1n);
    expect(pendingRequest).to.equal(0);
    const isPending = await stakingContract.isTokenPending(1n);
    expect(isPending).to.equal(false);

    await expect(stakingContract.getEncryptedStake(1n)).to.be.revertedWith("Stake not found");
  });

  it("prevents non-owners from redeeming a staking NFT", async function () {
    await stakingContract.connect(signers.alice).stake({ value: ethers.parseEther("1")} );
    await expect(stakingContract.connect(signers.bob).redeem(1n)).to.be.revertedWith("Not authorized");
  });
});
