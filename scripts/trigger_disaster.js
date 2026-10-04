/**
 * Triggers the demo disaster zone (central Texas) through the AgriSureOracle,
 * exactly like the dashboard's admin button and the AI oracle node do.
 *
 *   npx hardhat run scripts/trigger_disaster.js --network localhost
 */
import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEMO_ZONE, toUintLat, toUintLon } from "./lib/geo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`No deployment found at ${deploymentPath}. Run "npm run deploy" first.`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const code = await hre.ethers.provider.getCode(deployment.AgriSureOracle);
  if (code === "0x") {
    throw new Error("AgriSureOracle is not deployed on this node (was the Hardhat node restarted?). Run \"npm run deploy\" again.");
  }

  const [owner] = await hre.ethers.getSigners();
  const oracle = await hre.ethers.getContractAt("AgriSureOracle", deployment.AgriSureOracle, owner);

  const box = [
    toUintLat(DEMO_ZONE.minLat),
    toUintLat(DEMO_ZONE.maxLat),
    toUintLon(DEMO_ZONE.minLon),
    toUintLon(DEMO_ZONE.maxLon),
  ];
  console.log(`Triggering disaster zone lat [${DEMO_ZONE.minLat}, ${DEMO_ZONE.maxLat}] lon [${DEMO_ZONE.minLon}, ${DEMO_ZONE.maxLon}]`);
  const tx = await oracle.devTriggerDisaster(...box);
  await tx.wait();

  const escrow = await hre.ethers.getContractAt("AgriSureEscrow", deployment.AgriSureEscrow);
  const id = (await escrow.nextDisasterId()) - 1n;
  console.log(`Disaster #${id} is live on-chain. Farmers inside the zone can now claim.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
