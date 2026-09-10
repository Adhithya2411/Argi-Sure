import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

// Scales standard GPS coordinates (e.g. 12.9755) to finite-field compatible integers
const SCALE_FACTOR = 10000000;

export function scaleCoordinate(coord) {
    return Math.round(coord * SCALE_FACTOR).toString();
}

/**
 * Computes a Poseidon hash of the scaled GPS coordinates.
 * This is used for Step 1: Policy Commitment to anchor the farmer's location 
 * on-chain without revealing the actual GPS coordinates.
 */
export async function hashLocation(lat, lon) {
    const poseidon = await buildPoseidon();
    
    // Scale coordinates to match the circuit inputs
    const scaledLat = BigInt(scaleCoordinate(lat));
    const scaledLon = BigInt(scaleCoordinate(lon));
    
    // Compute Poseidon hash
    const hash = poseidon([scaledLat, scaledLon]);
    
    // Return hash as a hex string (bytes32 format for Solidity)
    return poseidon.F.toString(hash, 16).padStart(64, '0');
}


/**
 * Generates the Zero-Knowledge Proof completely locally in the browser
 * @param {Object} disasterZone - { minLat, maxLat, minLon, maxLon }
 * @param {Object} farmerLocation - { lat, lon }
 * @returns {Object} { proof, publicSignals, calldata }
 */
export async function generateProof(disasterZone, farmerLocation) {
    
    // Structure inputs exactly as required by the Circom circuit
    const input = {
        min_lat: disasterZone.minLat.toString(),
        max_lat: disasterZone.maxLat.toString(),
        min_lon: disasterZone.minLon.toString(),
        max_lon: disasterZone.maxLon.toString(),
        farmer_lat: scaleCoordinate(farmerLocation.lat),
        farmer_lon: scaleCoordinate(farmerLocation.lon)
    };

    console.log("Generating Zero-Knowledge Proof with scaled inputs:", input);

    // WASM and ZKEY files must be placed in the /public directory of the Next.js app
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        "/LocationVerifier.wasm",
        "/circuit_final.zkey"
    );

    // Export calldata for the smart contract
    const calldataStr = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const calldata = JSON.parse("[" + calldataStr + "]");

    return {
        proof,
        publicSignals,
        calldata: {
            a: calldata[0],
            b: calldata[1],
            c: calldata[2],
            Input: calldata[3]
        }
    };
}
