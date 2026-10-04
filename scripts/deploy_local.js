import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy Verifier
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("Groth16Verifier deployed to:", verifierAddr);

  // 2. Deploy Escrow
  const Escrow = await hre.ethers.getContractFactory("AgriSureEscrow");
  const escrow = await Escrow.deploy(verifierAddr);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log("AgriSureEscrow deployed to:", escrowAddr);

  // 3. Deploy Local LINK Token
  const MockLink = await hre.ethers.getContractFactory("LocalLinkToken");
  const linkToken = await MockLink.deploy();
  await linkToken.waitForDeployment();
  const linkAddr = await linkToken.getAddress();
  console.log("LocalLinkToken deployed to:", linkAddr);

  // 4. Deploy Local Oracle
  const MockOracle = await hre.ethers.getContractFactory("LocalOracle");
  const mockOracle = await MockOracle.deploy();
  await mockOracle.waitForDeployment();
  const mockOracleAddr = await mockOracle.getAddress();
  console.log("LocalOracle deployed to:", mockOracleAddr);

  // 5. Deploy AgriSureOracle
  const AgriOracle = await hre.ethers.getContractFactory("AgriSureOracle");
  const agriOracle = await AgriOracle.deploy(escrowAddr, linkAddr, mockOracleAddr);
  await agriOracle.waitForDeployment();
  const agriOracleAddr = await agriOracle.getAddress();
  console.log("AgriSureOracle deployed to:", agriOracleAddr);

  // 6. Setup Escrow -> Oracle permissions
  const tx1 = await escrow.setOracle(agriOracleAddr);
  await tx1.wait();
  console.log("Oracle configured in Escrow.");

  // 7. Fund the Escrow with 10 ETH
  const fundTx = await deployer.sendTransaction({
    to: escrowAddr,
    value: hre.ethers.parseEther("10.0")
  });
  await fundTx.wait();
  console.log("Funded Escrow with 10 ETH.");

  // 8. Fund AgriSureOracle with 100 LINK
  const linkTransferTx = await linkToken.transfer(agriOracleAddr, hre.ethers.parseEther("100.0"));
  await linkTransferTx.wait();
  console.log("Funded AgriSureOracle with 100 LINK.");

  // Persist addresses for Node scripts (oracle_node.cjs, trigger_disaster.js)
  const network = await hre.ethers.provider.getNetwork();
  const deploymentsDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const deployment = {
    chainId: Number(network.chainId),
    deployer: deployer.address,
    Groth16Verifier: verifierAddr,
    AgriSureEscrow: escrowAddr,
    LocalLinkToken: linkAddr,
    LocalOracle: mockOracleAddr,
    AgriSureOracle: agriOracleAddr,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(deploymentsDir, `${hre.network.name}.json`), JSON.stringify(deployment, null, 2));
  console.log(`Wrote deployments/${hre.network.name}.json`);

  // Update frontend contract configuration
  const contractPath = path.join(__dirname, "../frontend/utils/contract.js");
  let contractFile = fs.readFileSync(contractPath, "utf8");

  const setConst = (name, value) => {
    const re = new RegExp(`export const ${name} = ".*";`);
    if (re.test(contractFile)) {
      contractFile = contractFile.replace(re, `export const ${name} = "${value}";`);
    } else {
      contractFile = `export const ${name} = "${value}";\n` + contractFile;
    }
  };
  setConst("ESCROW_ADDRESS", escrowAddr);
  setConst("LOCAL_ORACLE_ADDRESS", mockOracleAddr);
  setConst("AGRI_ORACLE_ADDRESS", agriOracleAddr);

  fs.writeFileSync(contractPath, contractFile);
  console.log("Updated frontend addresses");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
