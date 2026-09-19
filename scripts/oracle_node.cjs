const { ethers } = require("hardhat");
const axios = require("axios");
require('dotenv').config();

async function main() {
    console.log("Starting Decentralized Oracle Node (AI-Driven)...");

    // 1. Fetch AI Prediction from the Next.js API
    console.log("Fetching latest AI disaster predictions from http://localhost:3000/api/disaster-zone...");
    let response;
    try {
        response = await axios.get("http://localhost:3000/api/disaster-zone");
    } catch (e) {
        console.error("Failed to connect to AI Endpoint. Ensure the Next.js frontend is running.");
        process.exit(1);
    }

    const data = response.data;

    if (!data.disasterDetected) {
        console.log("AI Model Status: Safe. No active disasters detected.");
        return;
    }

    console.log(`\n🚨 CRITICAL ALERT: Disaster Probability: ${(data.probability * 100).toFixed(2)}%`);
    console.log(`Weather Metrics: ${data.weather.rainfall}mm rainfall, ${data.weather.temp}°C`);
    console.log(`Target Bounding Box: 
        MinLat: ${data.boundingBox.minLat}
        MaxLat: ${data.boundingBox.maxLat}
        MinLon: ${data.boundingBox.minLon}
        MaxLon: ${data.boundingBox.maxLon}
    `);

    // 2. Format Coordinates for Smart Contract (Multiply by 10^6)
    const scale = 1e6;
    const minLat = Math.round(data.boundingBox.minLat * scale);
    const maxLat = Math.round(data.boundingBox.maxLat * scale);
    // Remember Longitude is usually negative in US, our contract logic expects positive representation or absolute if signed isn't used
    // Actually, in our contract we used absolute * 1e6. Let's just multiply.
    const minLon = Math.round(Math.abs(data.boundingBox.minLon) * scale);
    const maxLon = Math.round(Math.abs(data.boundingBox.maxLon) * scale);

    // 3. Connect to Smart Contract
    // Use the AgriSureOracle contract address. We need to load it from our local deployment.
    // For simplicity, we will assume you update this address after deploying:
    const ORACLE_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"; // Replace with your actual local Oracle address
    
    console.log("\nConnecting to Ethereum Network...");
    const [deployer] = await ethers.getSigners();
    
    // We attach to the AgriSureOracle contract
    const Oracle = await ethers.getContractFactory("AgriSureOracle");
    const oracle = Oracle.attach(ORACLE_ADDRESS);

    // 4. Trigger the Oracle Transaction
    console.log(`Pushing AI disaster zone to Blockchain (Contract: ${ORACLE_ADDRESS})...`);
    
    try {
        const tx = await oracle.connect(deployer).devTriggerDisaster(minLat, maxLat, minLon, maxLon);
        console.log(`Transaction submitted! Hash: ${tx.hash}`);
        
        console.log("Waiting for block confirmation...");
        await tx.wait();
        
        console.log("✅ Success! Blockchain state updated. Eligible farmers can now claim their insurance payouts.");
    } catch (e) {
        console.error("Transaction failed. Make sure Hardhat node is running and address is correct.");
        console.error(e.message);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
