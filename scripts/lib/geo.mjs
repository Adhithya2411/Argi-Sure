/**
 * Shared geo-encoding helpers for Node scripts & tests.
 * MUST stay identical to frontend/utils/zkp.js + frontend/utils/contract.js.
 *
 * Solidity uint256 and the circuit's 64-bit comparators cannot represent
 * negative numbers, so every coordinate is scaled by 10^7 and shifted:
 *   lat_u = round(lat * 1e7) +  900_000_000   (range 0 .. 1_800_000_000)
 *   lon_u = round(lon * 1e7) + 1_800_000_000  (range 0 .. 3_600_000_000)
 */
export const SCALE_FACTOR = 10_000_000;
export const LAT_OFFSET = 900_000_000;
export const LON_OFFSET = 1_800_000_000;

/** Demo scenario shared by fixtures, tests, the trigger script and the dashboard. */
export const DEMO_ZONE = { minLat: 29.0, maxLat: 31.5, minLon: -98.5, maxLon: -96.0 }; // Central Texas
export const DEMO_FARM = { lat: 30.2672, lon: -97.7431 }; // Austin, TX

export const toUintLat = (lat) => (Math.round(lat * SCALE_FACTOR) + LAT_OFFSET).toString();
export const toUintLon = (lon) => (Math.round(lon * SCALE_FACTOR) + LON_OFFSET).toString();

/** Converts a raw signed scaled value (e.g. USGS oracle_payload) into the offset encoding. */
export const scaledToUintLat = (scaled) => (Math.round(Number(scaled)) + LAT_OFFSET).toString();
export const scaledToUintLon = (scaled) => (Math.round(Number(scaled)) + LON_OFFSET).toString();

/** Poseidon(lat_u, lon_u) as a decimal string (the circuit's public `location_hash`). */
export async function poseidonLocation(latU, lonU) {
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  return poseidon.F.toString(poseidon([BigInt(latU), BigInt(lonU)]));
}

/** bytes32 hex form of a decimal field element (what commitPolicy expects). */
export const toBytes32 = (decimal) => "0x" + BigInt(decimal).toString(16).padStart(64, "0");
