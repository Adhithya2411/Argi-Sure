const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Zk-AgriSure: Performance & Gas Benchmarking", function () {
  let escrow, oracle;
  let owner, farmer, node;

  before(async function () {
    [owner, farmer, node] = await ethers.getSigners();

    // Deploy Oracle
    const Oracle = await ethers.getContractFactory("AgriSureOracle");
    oracle = await Oracle.deploy();
    await oracle.waitForDeployment();

    // Deploy Escrow
    const Escrow = await ethers.getContractFactory("AgriSureEscrow");
    escrow = await Escrow.deploy(await oracle.getAddress());
    await escrow.waitForDeployment();
  });

  it("Benchmark: Register Farmer", async function () {
    const tx = await escrow.connect(farmer).registerFarmer("AgriCorp", 50, "Wheat", 1);
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);
  });

  it("Benchmark: Commit Policy (ZKP Data Hash)", async function () {
    const locationHash = ethers.id("Austin, TX ZK Proof Coordinates");
    const tx = await escrow.connect(farmer).commitPolicy(locationHash);
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);
  });

  it("Benchmark: Trigger Disaster (AI Oracle)", async function () {
    const tx = await oracle.connect(owner).devTriggerDisaster(
      29000000, 31500000, 96000000, 98500000
    );
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);
  });
});
