import hre from "hardhat";
import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_URL = "http://localhost:3000/api/disaster-zone";

// GPS Offset logic to match frontend and circuits
const LAT_OFFSET = 900000000;
const LON_OFFSET = 1800000000;

async function main() {
    console.log("Starting Chainlink AI Daemon (Mock Node)...");
    const deploymentPath = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("No deployment found. Run deploy script first.");
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const [nodeOperator] = await hre.ethers.getSigners();
    const localOracle = await hre.ethers.getContractAt("LocalOracle", deployment.LocalOracle, nodeOperator);
    const agriOracle = await hre.ethers.getContractAt("AgriSureOracle", deployment.AgriSureOracle, nodeOperator);

    console.log(`Listening for ChainlinkRequested on ${deployment.AgriSureOracle}...`);

    agriOracle.on("ChainlinkRequested", async (requestId, event) => {
        console.log(`\n🔔 [Chainlink Node] Received ChainlinkRequested!`);
        console.log(`   Request ID: ${requestId}`);

        try {
            console.log(`   Fetching AI Data from ${API_URL}...`);
            const response = await axios.get(API_URL);
            const apiData = response.data;

            if (!apiData.disasterDetected || !apiData.events || apiData.events.length === 0) {
                console.log("   AI reported no disaster. Halting fulfillment.");
                return;
            }

            const worstEvent = apiData.events[0];

            console.log(`   AI Disaster Detected: Magnitude ${worstEvent.magnitude} at ${worstEvent.location}`);
            const bb = worstEvent.boundingBox;
            const minLat = BigInt(Math.round(bb.minLat) + LAT_OFFSET);
            const maxLat = BigInt(Math.round(bb.maxLat) + LAT_OFFSET);
            const minLon = BigInt(Math.round(bb.minLon) + LON_OFFSET);
            const maxLon = BigInt(Math.round(bb.maxLon) + LON_OFFSET);

            const selector = hre.ethers.id("fulfillDisasterData(bytes32,uint256,uint256,uint256,uint256)").substring(0, 10);
            console.log(`   Fulfilling request back to client contract...`);
            const tx = await localOracle.fulfillOracleRequest(
                deployment.AgriSureOracle,
                selector,
                requestId,
                minLat,
                maxLat,
                minLon,
                maxLon
            );
            await tx.wait();
            console.log(`✅ [Chainlink Node] Successfully fulfilled request on-chain!`);
        } catch (error) {
            console.error(`❌ [Chainlink Node] Error fulfilling request:`, error.message);
        }
    });
}

main().catch(console.error);
