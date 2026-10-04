import { expect } from "chai";
import hre from "hardhat";
import path from "path";
import { fileURLToPath } from "url";
import * as snarkjs from "snarkjs";
import {
  DEMO_ZONE,
  DEMO_FARM,
  toUintLat,
  toUintLon,
  poseidonLocation,
  toBytes32,
} from "../scripts/lib/geo.mjs";

const { ethers } = hre;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(__dirname, "../zk-circuit/LocationVerifier_js/LocationVerifier.wasm");
const ZKEY = path.join(__dirname, "../zk-circuit/circuit_final.zkey");

const ZONE_U = [
  toUintLat(DEMO_ZONE.minLat),
  toUintLat(DEMO_ZONE.maxLat),
  toUintLon(DEMO_ZONE.minLon),
  toUintLon(DEMO_ZONE.maxLon),
];

/** Builds a real Groth16 proof exactly like the browser does. */
async function prove(farm, zoneU = ZONE_U) {
  const farmerLat = toUintLat(farm.lat);
  const farmerLon = toUintLon(farm.lon);
  const locationHash = await poseidonLocation(farmerLat, farmerLon);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      min_lat: zoneU[0],
      max_lat: zoneU[1],
      min_lon: zoneU[2],
      max_lon: zoneU[3],
      location_hash: locationHash,
      farmer_lat: farmerLat,
      farmer_lon: farmerLon,
    },
    WASM,
    ZKEY
  );
  const calldata = JSON.parse("[" + (await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)) + "]");
  return { a: calldata[0], b: calldata[1], c: calldata[2], input: calldata[3], locationHash };
}

async function commitmentFor(farm) {
  return toBytes32(await poseidonLocation(toUintLat(farm.lat), toUintLon(farm.lon)));
}

describe("AgriSureEscrow", function () {
  this.timeout(180_000);

  let escrow, linkToken, mockOracle, agriOracle;
  let owner, farmer, farmer2, attacker;
  let disasterId;

  before(async function () {
    [owner, farmer, farmer2, attacker] = await ethers.getSigners();

    const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    escrow = await (await ethers.getContractFactory("AgriSureEscrow")).deploy(await verifier.getAddress());
    linkToken = await (await ethers.getContractFactory("LocalLinkToken")).deploy();
    mockOracle = await (await ethers.getContractFactory("LocalOracle")).deploy();
    agriOracle = await (await ethers.getContractFactory("AgriSureOracle")).deploy(
      await escrow.getAddress(),
      await linkToken.getAddress(),
      await mockOracle.getAddress()
    );
    await escrow.setOracle(await agriOracle.getAddress());
  });

  after(async function () {
    // snarkjs keeps bn128 worker threads alive; terminate so mocha can exit.
    if (globalThis.curve_bn128) await globalThis.curve_bn128.terminate();
  });

  describe("Funding & oracle", function () {
    it("accepts funding into escrow", async function () {
      const amount = ethers.parseEther("5.0");
      await expect(owner.sendTransaction({ to: await escrow.getAddress(), value: amount }))
        .to.emit(escrow, "EscrowFunded")
        .withArgs(owner.address, amount);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(amount);
    });

    it("lets the Chainlink oracle request and fulfill a disaster", async function () {
      await linkToken.transfer(await agriOracle.getAddress(), ethers.parseEther("1"));
      const receipt = await (await agriOracle.requestDisasterData()).wait();

      const iface = new ethers.Interface(["event ChainlinkRequested(bytes32 indexed id)"]);
      const log = receipt.logs.find((l) => l.address === agriOracle.target && l.topics[0] === iface.getEvent("ChainlinkRequested").topicHash);
      const reqId = iface.parseLog(log).args.id;

      await mockOracle.fulfillOracleRequest(
        await agriOracle.getAddress(),
        agriOracle.interface.getFunction("fulfillDisasterData").selector,
        reqId,
        ...ZONE_U
      );

      disasterId = 1;
      const d = await escrow.disasters(disasterId);
      expect([d.minLat, d.maxLat, d.minLon, d.maxLon].map(String)).to.deep.equal(ZONE_U);
      expect(d.isActive).to.be.true;
    });

    it("rejects a fulfillment for an unknown request id", async function () {
      await expect(
        mockOracle.fulfillOracleRequest(
          await agriOracle.getAddress(),
          agriOracle.interface.getFunction("fulfillDisasterData").selector,
          ethers.id("forged"),
          ...ZONE_U
        )
      ).to.be.reverted;
    });

    it("only the oracle owner can use devTriggerDisaster", async function () {
      await expect(agriOracle.connect(attacker).devTriggerDisaster(...ZONE_U)).to.be.revertedWith("Only callable by owner");
    });

    it("only the oracle contract can call escrow.triggerDisaster", async function () {
      await expect(escrow.connect(attacker).triggerDisaster(...ZONE_U)).to.be.revertedWith(
        "Only the Oracle can perform this action"
      );
    });

    it("rejects inverted or out-of-range bounding boxes", async function () {
      await expect(agriOracle.devTriggerDisaster(ZONE_U[1], ZONE_U[0], ZONE_U[2], ZONE_U[3])).to.be.revertedWith(
        "Invalid bounding box"
      );
      await expect(agriOracle.devTriggerDisaster(0, 1_800_000_001n, 0, 1)).to.be.revertedWith("Coordinates out of range");
    });
  });

  describe("Policy commitment", function () {
    it("commits a Premium policy with a Poseidon location hash", async function () {
      const hash = await commitmentFor(DEMO_FARM);
      await expect(escrow.connect(farmer).commitPolicy(hash, 2))
        .to.emit(escrow, "PolicyCommitted")
        .withArgs(farmer.address, hash);
      expect(await escrow.farmerTiers(farmer.address)).to.equal(2);
      expect(await escrow.policyHashes(farmer.address)).to.equal(hash);
    });

    it("rejects double registration, tier None and an empty hash", async function () {
      await expect(escrow.connect(farmer).commitPolicy(ethers.id("x"), 1)).to.be.revertedWith("Farmer already registered");
      await expect(escrow.connect(farmer2).commitPolicy(ethers.id("x"), 0)).to.be.revertedWith("Invalid tier");
      await expect(escrow.connect(farmer2).commitPolicy(ethers.ZeroHash, 1)).to.be.revertedWith("Invalid location hash");
    });
  });

  describe("Zero-knowledge claims", function () {
    it("pays the Premium payout for a valid proof of the committed location", async function () {
      const p = await prove(DEMO_FARM);
      const before = await ethers.provider.getBalance(farmer.address);
      const receipt = await (await escrow.connect(farmer).claimPayout(disasterId, p.a, p.b, p.c, p.input)).wait();
      const after = await ethers.provider.getBalance(farmer.address);
      expect(after).to.equal(before + ethers.parseEther("0.5") - receipt.gasUsed * receipt.gasPrice);
      expect(await escrow.hasClaimed(farmer.address, disasterId)).to.be.true;
    });

    it("prevents double claiming for the same disaster", async function () {
      const p = await prove(DEMO_FARM);
      await expect(escrow.connect(farmer).claimPayout(disasterId, p.a, p.b, p.c, p.input)).to.be.revertedWith(
        "Already claimed payout"
      );
    });

    it("rejects claims from unregistered addresses", async function () {
      const p = await prove(DEMO_FARM);
      await expect(escrow.connect(attacker).claimPayout(disasterId, p.a, p.b, p.c, p.input)).to.be.revertedWith(
        "Farmer is not registered"
      );
    });

    it("ANTI-SPOOFING: rejects a valid proof for a location other than the committed one", async function () {
      // farmer2 commits a farm OUTSIDE the zone (Dallas), then tries to prove a farm INSIDE it (Austin)
      const dallas = { lat: 32.7767, lon: -96.797 };
      await escrow.connect(farmer2).commitPolicy(await commitmentFor(dallas), 1);

      const spoof = await prove(DEMO_FARM);
      await expect(escrow.connect(farmer2).claimPayout(disasterId, spoof.a, spoof.b, spoof.c, spoof.input)).to.be.revertedWith(
        "Location does not match committed policy"
      );

      // Swapping in the committed hash as a public input breaks the proof itself
      const forged = [...spoof.input];
      forged[4] = BigInt(await escrow.policyHashes(farmer2.address)).toString();
      await expect(escrow.connect(farmer2).claimPayout(disasterId, spoof.a, spoof.b, spoof.c, forged)).to.be.revertedWith(
        "Invalid zero-knowledge proof"
      );
    });

    it("cannot even generate a proof for a farm outside the disaster zone", async function () {
      let threw = false;
      try {
        await prove({ lat: 32.7767, lon: -96.797 });
      } catch {
        threw = true;
      }
      expect(threw, "witness generation should fail outside the zone").to.be.true;
    });

    it("rejects a proof made against a different bounding box", async function () {
      await escrow.connect(attacker).commitPolicy(await commitmentFor(DEMO_FARM), 1);
      const widerZone = [toUintLat(28), ZONE_U[1], ZONE_U[2], ZONE_U[3]];
      const p = await prove(DEMO_FARM, widerZone);
      await expect(escrow.connect(attacker).claimPayout(disasterId, p.a, p.b, p.c, p.input)).to.be.revertedWith(
        "Mismatch minLat"
      );
    });
  });

  describe("Farmer reset", function () {
    it("a reset farmer can re-register but can never be paid twice for the same disaster", async function () {
      await expect(escrow.connect(farmer).devReset()).to.emit(escrow, "PolicyReset").withArgs(farmer.address);
      expect(await escrow.isRegistered(farmer.address)).to.be.false;

      await escrow.connect(farmer).commitPolicy(await commitmentFor(DEMO_FARM), 3);
      const p = await prove(DEMO_FARM);
      await expect(escrow.connect(farmer).claimPayout(disasterId, p.a, p.b, p.c, p.input)).to.be.revertedWith(
        "Already claimed payout"
      );
    });
  });
});
