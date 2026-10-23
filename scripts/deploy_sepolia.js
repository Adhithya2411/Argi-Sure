import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Official Chainlink Sepolia Addresses
const SEPOLIA_LINK_TOKEN = process.env.SEPOLIA_LINK_TOKEN || "0x779877A7B0D9E8603169DdbD7836e478b4624789";
const SEPOLIA_CHAINLINK_ORACLE = process.env.CHAINLINK_ORACLE_ADDRESS || process.env.SEPOLIA_CHAINLINK_ORACLE || "0x6090149792dAAeE9D1D568c9f9a6F6B46AA29eFD";

async function main() {
  console.log("=======================================================");
  console.log("      Zk-AgriSure: Sepolia Testnet Deployment          ");
  console.log("=======================================================");

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account found. Set PRIVATE_KEY in your .env file.");
  }

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deployer Account : ${deployer.address}`);
  console.log(`Sepolia Balance  : ${hre.ethers.formatEther(balance)} ETH`);

  // 1. Groth16 Verifier (Reuse existing if deployed)
  let verifierAddr = process.env.EXISTING_VERIFIER || "0x1dCEbE56A7E7CE55Ba42494F723Fd082d6b3E036";
  const verifierCode = await hre.ethers.provider.getCode(verifierAddr);
  if (verifierCode && verifierCode !== "0x") {
    console.log(`\n[1/3] Using already-deployed Groth16Verifier: ${verifierAddr}`);
  } else {
    console.log("\n[1/3] Deploying Groth16Verifier contract...");
    const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    verifierAddr = await verifier.getAddress();
    console.log(`✅ Groth16Verifier deployed to: ${verifierAddr}`);
  }
  console.log(`   Etherscan: https://sepolia.etherscan.io/address/${verifierAddr}`);

  // 2. AgriSureEscrow (Reuse existing if deployed)
  let escrowAddr = process.env.EXISTING_ESCROW || "0xeC99C485edb9EABb9D7C1Ad5d77882c7d066Be39";
  const escrowCode = await hre.ethers.provider.getCode(escrowAddr);
  let escrow;
  if (escrowCode && escrowCode !== "0x") {
    console.log(`\n[2/3] Using already-deployed AgriSureEscrow: ${escrowAddr}`);
    escrow = await hre.ethers.getContractAt("AgriSureEscrow", escrowAddr);
  } else {
    console.log("\n[2/3] Deploying AgriSureEscrow contract...");
    const Escrow = await hre.ethers.getContractFactory("AgriSureEscrow");
    escrow = await Escrow.deploy(verifierAddr);
    await escrow.waitForDeployment();
    escrowAddr = await escrow.getAddress();
    console.log(`✅ AgriSureEscrow deployed to: ${escrowAddr}`);
  }
  console.log(`   Etherscan: https://sepolia.etherscan.io/address/${escrowAddr}`);

  // 3. Deploy AgriSureOracle (Chainlink on Sepolia)
  console.log("\n[3/3] Deploying AgriSureOracle contract...");
  const AgriOracle = await hre.ethers.getContractFactory("AgriSureOracle");
  const agriOracle = await AgriOracle.deploy(escrowAddr, SEPOLIA_LINK_TOKEN, SEPOLIA_CHAINLINK_ORACLE);
  await agriOracle.waitForDeployment();
  const agriOracleAddr = await agriOracle.getAddress();
  console.log(`✅ AgriSureOracle deployed to: ${agriOracleAddr}`);
  console.log(`   Etherscan: https://sepolia.etherscan.io/address/${agriOracleAddr}`);

  // 4. Connect Oracle to Escrow
  console.log("\n[-] Configuring Oracle authorization in Escrow...");
  const authTx = await escrow.setOracle(agriOracleAddr);
  await authTx.wait();
  console.log("✅ AgriSureOracle authorized in AgriSureEscrow.");

  // Save deployment records
  const deploymentsDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const deployment = {
    network: "sepolia",
    chainId: 11155111,
    deployer: deployer.address,
    Groth16Verifier: verifierAddr,
    AgriSureEscrow: escrowAddr,
    AgriSureOracle: agriOracleAddr,
    ChainlinkLinkToken: SEPOLIA_LINK_TOKEN,
    ChainlinkOracle: SEPOLIA_CHAINLINK_ORACLE,
    deployedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(deploymentsDir, "sepolia.json"), JSON.stringify(deployment, null, 2));
  console.log(`\n[+] Wrote deployment details to deployments/sepolia.json`);

  // Update frontend contract configuration for Sepolia
  const contractPath = path.join(__dirname, "../frontend/utils/contract.js");
  if (fs.existsSync(contractPath)) {
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
    setConst("AGRI_ORACLE_ADDRESS", agriOracleAddr);
    fs.writeFileSync(contractPath, contractFile);
    console.log("✅ Updated frontend/utils/contract.js with live Sepolia addresses.");
  }

  console.log("\n=======================================================");
  console.log("            ETHERSCAN VERIFICATION COMMANDS            ");
  console.log("=======================================================");
  console.log(`npx hardhat verify --network sepolia ${verifierAddr}`);
  console.log(`npx hardhat verify --network sepolia ${escrowAddr} ${verifierAddr}`);
  console.log(`npx hardhat verify --network sepolia ${agriOracleAddr} ${escrowAddr} ${SEPOLIA_LINK_TOKEN} ${SEPOLIA_CHAINLINK_ORACLE}`);
  console.log("=======================================================\n");
}

main().catch((error) => {
  console.error("Deployment failed:", error.message || error);
  process.exitCode = 1;
});
