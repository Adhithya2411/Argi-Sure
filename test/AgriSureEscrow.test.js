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
  let groth16Verifier, escrow, linkToken, mockOracle, agriOracle;
  let owner, farmer;
  let disasterId;

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

    // Deploy Mocks
    const LinkToken = await ethers.getContractFactory("LocalLinkToken");
    linkToken = await LinkToken.deploy();
    await linkToken.waitForDeployment();

    const Oracle = await ethers.getContractFactory("LocalOracle");
    mockOracle = await Oracle.deploy();
    await mockOracle.waitForDeployment();

    // Deploy AgriOracle
    const AgriOracle = await ethers.getContractFactory("AgriSureOracle");
    agriOracle = await AgriOracle.deploy(
      await escrow.getAddress(),
      await linkToken.getAddress(),
      await mockOracle.getAddress()
    );
    await agriOracle.waitForDeployment();

    // Setup Oracle permissions in Escrow
    await escrow.setOracle(await agriOracle.getAddress());
  });

  it("Should accept funding into escrow", async function () {
    const fundAmount = ethers.parseEther("2.0"); // increased for multiple payouts
    await owner.sendTransaction({
      to: await escrow.getAddress(),
      value: fundAmount,
    });
    
    const balance = await ethers.provider.getBalance(await escrow.getAddress());
    expect(balance).to.equal(fundAmount);
  });

  it("Should allow the oracle to request and fulfill a disaster", async function () {
    // Read public inputs to get disaster zone coordinates
    const publicJsonPath = path.join(__dirname, "../zk-circuit/public.json");
    const publicInputs = JSON.parse(fs.readFileSync(publicJsonPath, "utf8"));
    
    const minLat = publicInputs[0];
    const maxLat = publicInputs[1];
    const minLon = publicInputs[2];
    const maxLon = publicInputs[3];

    // Transfer LINK to AgriOracle
    await linkToken.transfer(await agriOracle.getAddress(), ethers.parseEther("1"));

    // Request Disaster Data (this should trigger MockOracle)
    const tx = await agriOracle.requestDisasterData();
    const receipt = await tx.wait();

    // The ChainlinkClient emits a ChainlinkRequested event. We parse it to get the requestId.
    const chainlinkRequestedEvent = receipt.logs.find(
      (log) => log.address === agriOracle.target
    );
    
    // The signature for ChainlinkRequested is ChainlinkRequested(bytes32 indexed id)
    // We can use the contract interface to parse it.
    // However, AgriSureOracle doesn't explicitly declare ChainlinkRequested, it inherits it.
    // We can just grab the first topic if it's the only indexed argument (topic 1).
    // Or we parse it using a minimal ABI.
    const iface = new ethers.Interface(["event ChainlinkRequested(bytes32 indexed id)"]);
    const parsedLog = iface.parseLog({
      topics: chainlinkRequestedEvent.topics,
      data: chainlinkRequestedEvent.data,
    });
    
    const reqId = parsedLog.args.id;

    // Fulfill the request manually using MockOracle
    await mockOracle.fulfillOracleRequest(
      await agriOracle.getAddress(),
      agriOracle.interface.getFunction("fulfillDisasterData").selector,
      reqId,
      minLat,
      maxLat,
      minLon,
      maxLon
    );

    // After fulfillment, Escrow should have a registered disaster
    disasterId = 1;
    const activeDisaster = await escrow.disasters(disasterId);
    expect(activeDisaster.minLat).to.equal(BigInt(minLat));
    expect(activeDisaster.maxLat).to.equal(BigInt(maxLat));
    expect(activeDisaster.minLon).to.equal(BigInt(minLon));
    expect(activeDisaster.maxLon).to.equal(BigInt(maxLon));
    expect(activeDisaster.isActive).to.be.true;
  });

  it("Should allow farmer to commit a policy with a Premium Tier", async function () {
    const dummyHash = ethers.id("dummy_location_hash");
    const PREMIUM_TIER = 2; // enum Tier { None, Basic, Premium, Enterprise }

    await expect(escrow.connect(farmer).commitPolicy(dummyHash, PREMIUM_TIER))
      .to.emit(escrow, "PolicyCommitted")
      .withArgs(farmer.address, dummyHash);
      
    const tier = await escrow.farmerTiers(farmer.address);
    expect(tier).to.equal(PREMIUM_TIER);
  });

  it("Should allow farmer to claim a dynamic Premium payout with a valid ZKP", async function () {
    const proofPath = path.join(__dirname, "../zk-circuit/proof.json");
    const publicJsonPath = path.join(__dirname, "../zk-circuit/public.json");
    
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    const publicSignals = JSON.parse(fs.readFileSync(publicJsonPath, "utf8"));

    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const argv = JSON.parse("[" + calldata + "]");

    const farmerBalanceBefore = await ethers.provider.getBalance(farmer.address);

    const tx = await escrow.connect(farmer).claimPayout(disasterId, argv[0], argv[1], argv[2], argv[3]);
    const receipt = await tx.wait();

    const gasUsed = receipt.gasUsed * receipt.gasPrice;
    
    const farmerBalanceAfter = await ethers.provider.getBalance(farmer.address);
    
    // Premium tier payout is 0.5 ETH
    const expectedPayoutAmount = ethers.parseEther("0.5");

    expect(farmerBalanceAfter).to.equal(farmerBalanceBefore + expectedPayoutAmount - gasUsed);

    const hasClaimed = await escrow.hasClaimed(farmer.address, disasterId);
    expect(hasClaimed).to.be.true;
  });

  it("Should prevent double claiming for the same disaster", async function () {
    const proofPath = path.join(__dirname, "../zk-circuit/proof.json");
    const publicJsonPath = path.join(__dirname, "../zk-circuit/public.json");
    
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    const publicSignals = JSON.parse(fs.readFileSync(publicJsonPath, "utf8"));

    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const argv = JSON.parse("[" + calldata + "]");

    await expect(
      escrow.connect(farmer).claimPayout(disasterId, argv[0], argv[1], argv[2], argv[3])
    ).to.be.revertedWith("Already claimed payout");
  });
});
