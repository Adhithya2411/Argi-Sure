/**
 * AI-driven Oracle Node.
 * Pulls the brain.js disaster prediction from the Next.js API and pushes the
 * bounding box on-chain through AgriSureOracle.devTriggerDisaster.
 *
 *   npx hardhat run scripts/oracle_node.cjs --network localhost
 * (requires the frontend dev server running on http://localhost:3000)
 */
const hre = require("hardhat");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Must match frontend/utils/contract.js and scripts/lib/geo.mjs
const LAT_OFFSET = 900000000;   // 90  * 10^7
const LON_OFFSET = 1800000000;  // 180 * 10^7
const API_URL = process.env.ORACLE_API_URL || "http://localhost:3000/api/disaster-zone";

async function main() {
    console.log("Starting Decentralized Oracle Node (AI-Driven)...");

    // 1. Fetch AI Prediction from the Next.js API
    console.log(`Fetching latest AI disaster predictions from ${API_URL}...`);
    let response;
    try {
        response = await axios.get(API_URL);
    } catch (e) {
        throw new Error("Failed to connect to AI Endpoint. Ensure the Next.js frontend is running (npm run frontend).");
    }

    const data = response.data;

    if (!data.disasterDetected) {
        console.log("AI Model Status: Safe. No active disasters detected.");
        return;
    }

    console.log(`\n🚨 CRITICAL ALERT: AI Earthquake Probability: ${(data.probability * 100).toFixed(2)}%`);
    console.log(`Disaster Metrics: Magnitude ${data.weather.magnitude} at ${data.weather.location}`);

    // 2. Format Coordinates for Smart Contract
    // The dataset payload is GPS * 10^7 and may be NEGATIVE (southern / western
    // hemisphere). uint256 cannot hold negatives, so apply the same offsets the
    // frontend and circuit use.
    const bb = data.boundingBox;
    const box = [
        BigInt(Math.round(bb.minLat) + LAT_OFFSET),
        BigInt(Math.round(bb.maxLat) + LAT_OFFSET),
        BigInt(Math.round(bb.minLon) + LON_OFFSET),
        BigInt(Math.round(bb.maxLon) + LON_OFFSET),
    ];
    console.log(`Target Bounding Box (GPS): lat [${bb.minLat / 1e7}, ${bb.maxLat / 1e7}] lon [${bb.minLon / 1e7}, ${bb.maxLon / 1e7}]`);
    console.log(`Encoded for chain: ${box.map(String).join(", ")}`);

    // 3. Connect to Smart Contract (address comes from the last deploy)
    const deploymentPath = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`No deployment found at ${deploymentPath}. Run "npm run deploy" first.`);
    }
    const { AgriSureOracle: ORACLE_ADDRESS } = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    if ((await hre.ethers.provider.getCode(ORACLE_ADDRESS)) === "0x") {
        throw new Error("AgriSureOracle not found on this node (was the Hardhat node restarted?). Run \"npm run deploy\" again.");
    }

    console.log("\nConnecting to Ethereum Network...");
    const [deployer] = await hre.ethers.getSigners();
    const oracle = await hre.ethers.getContractAt("AgriSureOracle", ORACLE_ADDRESS, deployer);

    // 4. Trigger the Oracle Transaction
    console.log(`Pushing AI disaster zone to Blockchain (Contract: ${ORACLE_ADDRESS})...`);
    const tx = await oracle.devTriggerDisaster(...box);
    console.log(`Transaction submitted! Hash: ${tx.hash}`);
    console.log("Waiting for block confirmation...");
    await tx.wait();
    console.log("✅ Success! Blockchain state updated. Eligible farmers can now claim their insurance payouts.");
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
