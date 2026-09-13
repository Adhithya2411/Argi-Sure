import { ethers } from "ethers";
import { buildPoseidon } from "circomlibjs";
import fs from "fs";

// Need to read the ABI and address dynamically just in case.
import { ESCROW_ABI, ESCROW_ADDRESS } from "./utils/contract.js";

const SCALE_FACTOR = 10000000;
function scaleCoordinate(coord) {
    return Math.round(coord * SCALE_FACTOR).toString();
}

async function hashLocation(lat, lon) {
    const poseidon = await buildPoseidon();
    const scaledLat = BigInt(scaleCoordinate(lat));
    const scaledLon = BigInt(scaleCoordinate(lon));
    const hash = poseidon([scaledLat, scaledLon]);
    return poseidon.F.toString(hash, 16).padStart(64, '0');
}

async function main() {
    console.log("Connecting to local hardhat node...");
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    
    // Hardhat Account #2 (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
    const farmerWallet = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider); 
    
    const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, farmerWallet);

    console.log("Generating Location Hash for Austin, TX (30.2711, -97.7437)...");
    const lat = 30.2711;
    const lon = -97.7437;
    const locationHash = await hashLocation(lat, lon);
    console.log("Hash:", `0x${locationHash}`);

    console.log("Calling commitPolicy...");
    try {
        const tierInt = 1;
        const tx = await escrowContract.commitPolicy(`0x${locationHash}`, tierInt, { gasLimit: 300000 });
        await tx.wait();
        console.log("commitPolicy SUCCEEDED!");
    } catch (e) {
        console.error("commitPolicy FAILED:", e);
    }
}

main().catch(console.error);
