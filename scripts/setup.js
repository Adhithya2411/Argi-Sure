import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { ethers } = hre;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const [owner] = await ethers.getSigners();
  console.log("Using account:", owner.address);

  // Address where ignition deploys the first contract locally
  const escrowAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const Escrow = await ethers.getContractFactory("AgriSureEscrow");
  const escrow = Escrow.attach(escrowAddress);

  console.log("Funding Escrow with 1 ETH...");
  await owner.sendTransaction({
    to: escrowAddress,
    value: ethers.parseEther("1.0"),
  });

  console.log("Setting Oracle to owner address for local testing...");
  await escrow.setOracle(owner.address);

  console.log("Triggering Disaster Zone (from public.json)...");
  const publicJsonPath = path.join(__dirname, "../zk-circuit/public.json");
  const publicInputs = JSON.parse(fs.readFileSync(publicJsonPath, "utf8"));

  const tx = await escrow.triggerDisaster(
    publicInputs[0],
    publicInputs[1],
    publicInputs[2],
    publicInputs[3]
  );
  await tx.wait();

  console.log("✅ Disaster Triggered. Smart Contract is ready for frontend testing.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
