import * as snarkjs from "snarkjs";

// Scales standard GPS coordinates (e.g. 12.9755) to finite-field compatible integers
const SCALE_FACTOR = 10000000;

export function scaleCoordinate(coord) {
    return Math.round(coord * SCALE_FACTOR).toString();
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
