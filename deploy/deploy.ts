import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const sepoliaOracle = "0xa02Cda4Ca3a71D7C46997716F4283aa851C28812";
  let oracleAddress = sepoliaOracle;

  const localNetworks = new Set(["hardhat", "localhost", "anvil"]);
  if (localNetworks.has(hre.network.name)) {
    const oracleGetter = (hre.fhevm as unknown as { getDecryptionOracleAddress?: () => Promise<string> })
      .getDecryptionOracleAddress;
    if (oracleGetter) {
      oracleAddress = await oracleGetter.call(hre.fhevm);
    }
  }

  const enforceOracle = !localNetworks.has(hre.network.name);

  const deployedVaultbornStaking = await deploy("VaultbornStaking", {
    from: deployer,
    log: true,
    args: [oracleAddress, enforceOracle],
  });

  console.log(`VaultbornStaking contract: `, deployedVaultbornStaking.address);
};
export default func;
func.id = "deploy_vaultborn_staking"; // id required to prevent reexecution
func.tags = ["VaultbornStaking"];
