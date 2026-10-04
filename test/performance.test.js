import { expect } from "chai";
import pkg from "hardhat";
import path from "path";
import { fileURLToPath } from "url";
import * as snarkjs from "snarkjs";
import { DEMO_ZONE, DEMO_FARM, toUintLat, toUintLon, poseidonLocation, toBytes32 } from "../scripts/lib/geo.mjs";
const { ethers } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Zk-AgriSure: Performance & Gas Benchmarking", function () {
  this.timeout(180_000);

  let escrow, oracle;
  let owner, farmer;
  const zoneU = [
    toUintLat(DEMO_ZONE.minLat),
    toUintLat(DEMO_ZONE.maxLat),
    toUintLon(DEMO_ZONE.minLon),
    toUintLon(DEMO_ZONE.maxLon),
  ];
  const farmU = [toUintLat(DEMO_FARM.lat), toUintLon(DEMO_FARM.lon)];

  before(async function () {
    [owner, farmer] = await ethers.getSigners();

    // 1. Deploy Verifier
    const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    // 2. Deploy Escrow
    escrow = await (await ethers.getContractFactory("AgriSureEscrow")).deploy(await verifier.getAddress());
    // 3. Deploy Local LINK Token
    const linkToken = await (await ethers.getContractFactory("LocalLinkToken")).deploy();
    // 4. Deploy Local Oracle
    const mockOracle = await (await ethers.getContractFactory("LocalOracle")).deploy();
    // 5. Deploy AgriSureOracle
    oracle = await (await ethers.getContractFactory("AgriSureOracle")).deploy(
      await escrow.getAddress(),
      await linkToken.getAddress(),
      await mockOracle.getAddress()
    );
    // 6. Setup Escrow -> Oracle permissions & liquidity
    await escrow.setOracle(await oracle.getAddress());
    await owner.sendTransaction({ to: await escrow.getAddress(), value: ethers.parseEther("1") });
  });

  after(async function () {
    if (globalThis.curve_bn128) await globalThis.curve_bn128.terminate();
  });

  it("Benchmark: Commit Policy (Poseidon location hash)", async function () {
    const locationHash = toBytes32(await poseidonLocation(...farmU));
    const receipt = await (await escrow.connect(farmer).commitPolicy(locationHash, 1)).wait();
    expect(receipt.status).to.equal(1);
  });

  it("Benchmark: Trigger Disaster (AI Oracle)", async function () {
    const receipt = await (await oracle.connect(owner).devTriggerDisaster(...zoneU)).wait();
    expect(receipt.status).to.equal(1);
  });

  it("Benchmark: Claim Payout (on-chain Groth16 verification)", async function () {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      {
        min_lat: zoneU[0],
        max_lat: zoneU[1],
        min_lon: zoneU[2],
        max_lon: zoneU[3],
        location_hash: await poseidonLocation(...farmU),
        farmer_lat: farmU[0],
        farmer_lon: farmU[1],
      },
      path.join(__dirname, "../zk-circuit/LocationVerifier_js/LocationVerifier.wasm"),
      path.join(__dirname, "../zk-circuit/circuit_final.zkey")
    );
    const cd = JSON.parse("[" + (await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)) + "]");
    const receipt = await (await escrow.connect(farmer).claimPayout(1, cd[0], cd[1], cd[2], cd[3])).wait();
    expect(receipt.status).to.equal(1);
  });
});
