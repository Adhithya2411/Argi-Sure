import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { LAT_OFFSET, LON_OFFSET, SCALE_FACTOR } from "./contract";

/**
 * Scales a GPS coordinate to a finite-field compatible integer.
 * Does NOT apply the offset — just multiplies by 10^7 and rounds.
 */
export function scaleCoordinate(coord) {
    return Math.round(coord * SCALE_FACTOR).toString();
}

/**
 * Scales and offsets a latitude for on-chain / circuit use.
 * lat ∈ [-90, 90] → [0, 1_800_000_000]
 */
export function toUintLat(lat) {
    return (Math.round(lat * SCALE_FACTOR) + LAT_OFFSET).toString();
}

/**
 * Scales and offsets a longitude for on-chain / circuit use.
 * lon ∈ [-180, 180] → [0, 3_600_000_000]
 */
export function toUintLon(lon) {
    return (Math.round(lon * SCALE_FACTOR) + LON_OFFSET).toString();
}

/**
 * Converts an on-chain uint256 latitude back to a GPS float.
 */
export function fromUintLat(uintLat) {
    return (Number(uintLat) - LAT_OFFSET) / SCALE_FACTOR;
}

/**
 * Converts an on-chain uint256 longitude back to a GPS float.
 */
export function fromUintLon(uintLon) {
    return (Number(uintLon) - LON_OFFSET) / SCALE_FACTOR;
}

/**
 * Computes a Poseidon hash of the OFFSET-scaled GPS coordinates.
 * This is used for Step 1: Policy Commitment to anchor the farmer's location
 * on-chain without revealing the actual GPS coordinates.
 */
export async function hashLocation(lat, lon) {
    const poseidon = await buildPoseidon();

    // Use the offset-scaled values so the hash matches what the circuit sees
    const scaledLat = BigInt(toUintLat(lat));
    const scaledLon = BigInt(toUintLon(lon));

    const hash = poseidon([scaledLat, scaledLon]);

    // Return hash as a hex string (bytes32 format for Solidity)
    return poseidon.F.toString(hash, 16).padStart(64, '0');
}


/**
 * Generates the Zero-Knowledge Proof completely locally in the browser.
 *
 * @param {Object} disasterZone - { minLat, maxLat, minLon, maxLon } as raw GPS floats
 * @param {Object} farmerLocation - { lat, lon } as raw GPS floats
 * @param {Function} onLog - Callback function for real-time progress logs
 * @returns {Object} { proof, publicSignals, calldata }
 */
export async function generateProof(disasterZone, farmerLocation, onLog = () => {}) {

    onLog("[INFO] Initializing Edge-Computation Protocol...");
    onLog("[DEBUG] Scaling GPS Float Telemetry by 10^7 factor + offset...");

    const locHashHex = await hashLocation(farmerLocation.lat, farmerLocation.lon);
    
    // Structure inputs exactly as required by the Circom circuit.
    // All values must be non-negative integers (the circuit uses LessEqThan(64)).
    const input = {
        min_lat: toUintLat(disasterZone.minLat),
        max_lat: toUintLat(disasterZone.maxLat),
        min_lon: toUintLon(disasterZone.minLon),
        max_lon: toUintLon(disasterZone.maxLon),
        farmer_lat: toUintLat(farmerLocation.lat),
        farmer_lon: toUintLon(farmerLocation.lon),
        location_hash: BigInt("0x" + locHashHex).toString()
    };

    onLog("[DEBUG] Compiling discrete inputs to Rank-1 Constraint System (R1CS)...");
    onLog(`[DEBUG] Circuit inputs: min_lat=${input.min_lat}, max_lat=${input.max_lat}, min_lon=${input.min_lon}, max_lon=${input.max_lon}`);
    onLog(`[DEBUG] Farmer (offset): lat=${input.farmer_lat}, lon=${input.farmer_lon}`);

    const logger = {
        info: (msg) => onLog(`[INFO] ${msg}`),
        debug: (msg) => onLog(`[DEBUG] ${msg}`)
    };

    onLog("[INFO] Loading LocationVerifier.wasm and zkey proving key...");

    // WASM and ZKEY files must be placed in the /public directory of the Next.js app
    let proof, publicSignals;
    try {
        const result = await snarkjs.groth16.fullProve(
            input,
            "/LocationVerifier.wasm",
            "/circuit_final.zkey",
            logger
        );
        proof = result.proof;
        publicSignals = result.publicSignals;
    } catch (err) {
        if (err.message && err.message.includes("Assert Failed")) {
            throw new Error("Cryptographic rejection: Your farm coordinates mathematically fall OUTSIDE the active disaster zone.");
        }
        throw err;
    }

    onLog("[SUCCESS] Zero-Knowledge Proof generated mathematically.");
    onLog("[INFO] Exporting Solidity calldata for Escrow settlement...");

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
