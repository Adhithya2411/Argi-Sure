/**
 * Regenerates zk-circuit/{input,proof,public}.json from the CURRENT circuit
 * build so fixtures can never drift out of sync with the verifier.
 *
 * Demo scenario: a farm in Austin, TX inside a central-Texas disaster box
 * (the same box the dashboard's admin trigger and trigger_disaster.js use).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as snarkjs from "snarkjs";
import { toUintLat, toUintLon, poseidonLocation, DEMO_ZONE, DEMO_FARM } from "./lib/geo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkDir = path.join(__dirname, "..", "zk-circuit");


async function main() {
  const farmerLat = toUintLat(DEMO_FARM.lat);
  const farmerLon = toUintLon(DEMO_FARM.lon);

  const input = {
    min_lat: toUintLat(DEMO_ZONE.minLat),
    max_lat: toUintLat(DEMO_ZONE.maxLat),
    min_lon: toUintLon(DEMO_ZONE.minLon),
    max_lon: toUintLon(DEMO_ZONE.maxLon),
    location_hash: await poseidonLocation(farmerLat, farmerLon),
    farmer_lat: farmerLat,
    farmer_lon: farmerLon,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    path.join(zkDir, "LocationVerifier_js", "LocationVerifier.wasm"),
    path.join(zkDir, "circuit_final.zkey")
  );

  const vKey = JSON.parse(fs.readFileSync(path.join(zkDir, "verification_key.json"), "utf8"));
  const ok = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  if (!ok) throw new Error("Generated sample proof failed off-chain verification");

  fs.writeFileSync(path.join(zkDir, "input.json"), JSON.stringify(input, null, 2));
  fs.writeFileSync(path.join(zkDir, "proof.json"), JSON.stringify(proof, null, 2));
  fs.writeFileSync(path.join(zkDir, "public.json"), JSON.stringify(publicSignals, null, 2));
  console.log("Sample proof regenerated and verified off-chain. Public signals:", publicSignals);
}

main()
  .then(() => process.exit(0)) // snarkjs keeps worker threads alive
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
