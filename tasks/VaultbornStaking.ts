import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { FhevmType } from "@fhevm/hardhat-plugin";

task("task:staking-address", "Prints the VaultbornStaking contract address").setAction(
  async function (_taskArgs: TaskArguments, hre) {
    const deployment = await hre.deployments.get("VaultbornStaking");
    console.log(`VaultbornStaking address: ${deployment.address}`);
  },
);

task("task:stake", "Stake ETH and mint a staking certificate")
  .addParam("value", "Amount of ETH to stake, expressed in ether")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const amount = ethers.parseEther(taskArguments.value as string);
    const [signer] = await ethers.getSigners();
    const deployment = await deployments.get("VaultbornStaking");
    const staking = await ethers.getContractAt("VaultbornStaking", deployment.address);

    const tx = await staking.connect(signer).stake({ value: amount });
    console.log(`stake tx: ${tx.hash}`);
    const receipt = await tx.wait();

    const parsedLog = receipt?.logs
      .map(log => {
        try {
          return staking.interface.parseLog(log);
        } catch (error) {
          return null;
        }
      })
      .find(event => event?.name === "StakeMinted");

    if (!parsedLog) {
      console.log("StakeMinted event not found in transaction logs");
      return;
    }

    const tokenId = parsedLog.args?.tokenId?.toString() ?? "";
    const encryptedAmount = parsedLog.args?.encryptedAmount as string;
    console.log(`Minted tokenId: ${tokenId}`);

    await fhevm.initializeCLIApi();
    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint256,
      encryptedAmount,
      deployment.address,
      signer,
    );
    console.log(`Encrypted amount: ${encryptedAmount}`);
    console.log(`Clear amount    : ${ethers.formatEther(decrypted)} ETH`);
  });

task("task:get-encrypted-stake", "Decrypt the stake associated with a token")
  .addParam("tokenid", "Token identifier to inspect")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const tokenId = BigInt(taskArguments.tokenid as string);
    const deployment = await deployments.get("VaultbornStaking");
    const staking = await ethers.getContractAt("VaultbornStaking", deployment.address);
    const [signer] = await ethers.getSigners();

    const encryptedHandle = await staking.getEncryptedStake(tokenId);
    await fhevm.initializeCLIApi();
    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint256,
      encryptedHandle,
      deployment.address,
      signer,
    );

    console.log(`Encrypted stake handle: ${encryptedHandle}`);
    console.log(`Decrypted amount      : ${ethers.formatEther(decrypted)} ETH`);
  });

task("task:redeem", "Burn a staking NFT and request withdrawal")
  .addParam("tokenid", "Token identifier to redeem")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const tokenId = BigInt(taskArguments.tokenid as string);
    const deployment = await deployments.get("VaultbornStaking");
    const staking = await ethers.getContractAt("VaultbornStaking", deployment.address);
    const [signer] = await ethers.getSigners();

    const tx = await staking.connect(signer).redeem(tokenId);
    console.log(`redeem tx: ${tx.hash}`);
    const receipt = await tx.wait();

    const parsedLog = receipt?.logs
      .map(log => {
        try {
          return staking.interface.parseLog(log);
        } catch (error) {
          return null;
        }
      })
      .find(event => event?.name === "WithdrawRequested");

    if (parsedLog) {
      console.log(`Decryption request submitted: ${parsedLog.args?.requestId.toString()}`);
    }

    if (fhevm.isMock) {
      console.log("Awaiting mock decryption oracle response...");
      await fhevm.awaitDecryptionOracle();
      console.log("Mock oracle fulfilled decryption requests.");
    } else {
      console.log("Decryption will complete once the oracle fulfills the request on-chain.");
    }
  });
