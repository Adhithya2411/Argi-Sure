import { expect } from "chai";
import pkg from "hardhat";
const { ethers } = pkg;

describe("Zk-AgriSure: Performance & Gas Benchmarking", function () {
  let escrow, oracle;
  let owner, farmer, node;

  before(async function () {
    [owner, farmer, node] = await ethers.getSigners();

    // 1. Deploy Verifier
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddr = await verifier.getAddress();

    // 2. Deploy Escrow
    const Escrow = await ethers.getContractFactory("AgriSureEscrow");
    escrow = await Escrow.deploy(verifierAddr);
    await escrow.waitForDeployment();
    const escrowAddr = await escrow.getAddress();

    // 3. Deploy Local LINK Token
    const MockLink = await ethers.getContractFactory("LocalLinkToken");
    const linkToken = await MockLink.deploy();
    await linkToken.waitForDeployment();
    const linkAddr = await linkToken.getAddress();

    // 4. Deploy Local Oracle
    const MockOracle = await ethers.getContractFactory("LocalOracle");
    const mockOracle = await MockOracle.deploy();
    await mockOracle.waitForDeployment();
    const mockOracleAddr = await mockOracle.getAddress();

    // 5. Deploy AgriSureOracle
    const Oracle = await ethers.getContractFactory("AgriSureOracle");
    oracle = await Oracle.deploy(escrowAddr, linkAddr, mockOracleAddr);
    await oracle.waitForDeployment();
    const oracleAddr = await oracle.getAddress();

    // 6. Setup Escrow -> Oracle permissions
    await escrow.setOracle(oracleAddr);
  });

  it("Benchmark: Commit Policy (ZKP Data Hash)", async function () {
    const locationHash = ethers.id("Austin, TX ZK Proof Coordinates");
    const tx = await escrow.connect(farmer).commitPolicy(locationHash, 1);
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
