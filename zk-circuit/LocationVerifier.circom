pragma circom 2.1.6;

// Import pre-audited circuits from circomlib
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";

/*
 * LocationVerifier
 *
 * Proves, without revealing (farmer_lat, farmer_lon), that:
 *   1. Poseidon(farmer_lat, farmer_lon) == location_hash
 *      -> the hidden location is the SAME one the farmer committed on-chain
 *         at policy time (anti-spoofing; the contract checks location_hash
 *         against the farmer's stored policy hash).
 *   2. min_lat <= farmer_lat <= max_lat  and  min_lon <= farmer_lon <= max_lon
 *      -> the hidden location lies inside the Oracle's disaster bounding box.
 *
 * All coordinates are scaled by 10^7 and shifted to be non-negative:
 *   lat_u = round(lat * 10^7) + 90  * 10^7   (0 .. 1.8e9)
 *   lon_u = round(lon * 10^7) + 180 * 10^7   (0 .. 3.6e9)
 */
template LocationVerifier() {
    // PUBLIC INPUTS (The Oracle's Broadcasted Disaster Zone)
    signal input min_lat;
    signal input max_lat;
    signal input min_lon;
    signal input max_lon;
    // PUBLIC INPUT (The farmer's on-chain policy commitment)
    signal input location_hash;

    // PRIVATE INPUTS (The Farmer's Hidden Scaled GPS Data)
    signal input farmer_lat;
    signal input farmer_lon;

    // Range-check the private inputs so the 64-bit comparators are sound
    component latBits = Num2Bits(64);
    latBits.in <== farmer_lat;
    component lonBits = Num2Bits(64);
    lonBits.in <== farmer_lon;

    // Constraint 0: the hidden location matches the committed hash
    component hasher = Poseidon(2);
    hasher.inputs[0] <== farmer_lat;
    hasher.inputs[1] <== farmer_lon;
    hasher.out === location_hash;

    // Initialize 64-bit LessEqThan comparators
    component latLower = LessEqThan(64);
    component latUpper = LessEqThan(64);
    component lonLower = LessEqThan(64);
    component lonUpper = LessEqThan(64);

    // Constraint 1: min_lat <= farmer_lat
    latLower.in[0] <== min_lat;
    latLower.in[1] <== farmer_lat;
    latLower.out === 1;

    // Constraint 2: farmer_lat <= max_lat
    latUpper.in[0] <== farmer_lat;
    latUpper.in[1] <== max_lat;
    latUpper.out === 1;

    // Constraint 3: min_lon <= farmer_lon
    lonLower.in[0] <== min_lon;
    lonLower.in[1] <== farmer_lon;
    lonLower.out === 1;

    // Constraint 4: farmer_lon <= max_lon
    lonUpper.in[0] <== farmer_lon;
    lonUpper.in[1] <== max_lon;
    lonUpper.out === 1;
}

// Public signal order: [min_lat, max_lat, min_lon, max_lon, location_hash]
component main {public [min_lat, max_lat, min_lon, max_lon, location_hash]} = LocationVerifier();
