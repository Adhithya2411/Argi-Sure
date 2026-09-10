import { expect } from "chai";
import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as snarkjs from "snarkjs";

const { ethers } = hre;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("AgriSureEscrow", function () {
  let groth16Verifier, escrow;
  let owner, farmer;

  before(async function () {
    [owner, farmer] = await ethers.getSigners();

    // Deploy Verifier
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    groth16Verifier = await Verifier.deploy();
    await groth16Verifier.waitForDeployment();

    // Deploy Escrow
    const Escrow = await ethers.getContractFactory("AgriSureEscrow");
    escrow = await Escrow.deploy(await groth16Verifier.getAddress());
    await escrow.waitForDeployment();
  });

  it("Should accept funding into escrow", async function () {
    const fundAmount = ethers.parseEther("1.0");
    await owner.sendTransaction({
      to: await escrow.getAddress(),
      value: fundAmount,
    });
    
    const balance = await ethers.provider.getBalance(await escrow.getAddress());
    expect(balance).to.equal(fundAmount);
  });

  it("Should allow owner to set oracle and oracle to trigger a disaster", async function () {
    await escrow.setOracle(owner.address);

    // Read public inputs to get disaster zone coordinates
    const publicJsonPath = path.join(__dirname, "../zk-circuit/public.json");
    const publicInputs = JSON.parse(fs.readFileSync(publicJsonPath, "utf8"));
    
    const minLat = publicInputs[0];
    const maxLat = publicInputs[1];
    const minLon = publicInputs[2];
    const maxLon = publicInputs[3];

    await escrow.triggerDisaster(minLat, maxLat, minLon, maxLon);

    const activeDisaster = await escrow.activeDisaster();
    expect(activeDisaster.minLat).to.equal(BigInt(minLat));
    expect(activeDisaster.maxLat).to.equal(BigInt(maxLat));
    expect(activeDisaster.minLon).to.equal(BigInt(minLon));
    expect(activeDisaster.maxLon).to.equal(BigInt(maxLon));
    expect(activeDisaster.isActive).to.be.true;
  });

  it("Should allow farmer to commit a policy using a location hash", async function () {
    const dummyHash = ethers.id("dummy_location_hash");
    await expect(escrow.connect(farmer).commitPolicy(dummyHash))
      .to.emit(escrow, "PolicyCommitted")
      .withArgs(farmer.address, dummyHash);
      
    const isReg = await escrow.isRegistered(farmer.address);
    expect(isReg).to.be.true;
  });

  it("Should allow farmer to claim payout with a valid zero-knowledge proof", async function () {
    const proofPath = path.join(__dirname, "../zk-circuit/proof.json");
    const publicJsonPath = path.join(__dirname, "../zk-circuit/public.json");
    
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    const publicSignals = JSON.parse(fs.readFileSync(publicJsonPath, "utf8"));

    // SnarkJS utility to convert JSON proof into solidity calldata arrays
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    
    // The exported calldata is a string representing arguments.
    const argv = JSON.parse("[" + calldata + "]");

    const a = argv[0];
    const b = argv[1];
    const c = argv[2];
    const Input = argv[3];

    const farmerBalanceBefore = await ethers.provider.getBalance(farmer.address);

    const tx = await escrow.connect(farmer).claimPayout(a, b, c, Input);
    const receipt = await tx.wait();

    const gasUsed = receipt.gasUsed * receipt.gasPrice;
    
    const farmerBalanceAfter = await ethers.provider.getBalance(farmer.address);
    const payoutAmount = ethers.parseEther("0.1");

    // The new balance should be: old balance + payout - gas used for tx
    expect(farmerBalanceAfter).to.equal(farmerBalanceBefore + payoutAmount - gasUsed);

    const hasClaimed = await escrow.hasClaimed(farmer.address);
    expect(hasClaimed).to.be.true;
  });

  it("Should prevent double claiming", async function () {
    const proofPath = path.join(__dirname, "../zk-circuit/proof.json");
    const publicJsonPath = path.join(__dirname, "../zk-circuit/public.json");
    
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    const publicSignals = JSON.parse(fs.readFileSync(publicJsonPath, "utf8"));

    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const argv = JSON.parse("[" + calldata + "]");

    await expect(
      escrow.connect(farmer).claimPayout(argv[0], argv[1], argv[2], argv[3])
    ).to.be.revertedWith("Already claimed payout");
  });
});
