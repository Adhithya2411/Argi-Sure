pragma circom 2.1.6;

// Import pre-audited comparator circuits from circomlib
include "node_modules/circomlib/circuits/comparators.circom";

template LocationVerifier() {
    // PUBLIC INPUTS (The Oracle's Broadcasted Disaster Zone)
    signal input min_lat;
    signal input max_lat;
    signal input min_lon;
    signal input max_lon;

    // PRIVATE INPUTS (The Farmer's Hidden Scaled GPS Data)
    signal input farmer_lat;
    signal input farmer_lon;

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

// Instantiate the component keeping farmer coordinates private
component main {public [min_lat, max_lat, min_lon, max_lon]} = LocationVerifier();
