// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[4] calldata _pubSignals
    ) external view returns (bool);
}

contract AgriSureEscrow {
    address public owner;
    address public oracle;
    IGroth16Verifier public verifier;
    
    enum Tier { None, Basic, Premium, Enterprise }

    struct DisasterZone {
        uint256 minLat;
        uint256 maxLat;
        uint256 minLon;
        uint256 maxLon;
        bool isActive;
    }

    mapping(uint256 => DisasterZone) public disasters;
    uint256 public nextDisasterId = 1;
    
    // Farmer mapping to disasterId to claim status
    mapping(address => mapping(uint256 => bool)) public hasClaimed;
    mapping(address => bytes32) public policyHashes;
    mapping(address => bool) public isRegistered;
    mapping(address => Tier) public farmerTiers;

    event EscrowFunded(address funder, uint256 amount);
    event DisasterTriggered(uint256 minLat, uint256 maxLat, uint256 minLon, uint256 maxLon);
    event PayoutClaimed(address farmer, uint256 amount);
    event OracleUpdated(address oldOracle, address newOracle);
    event PolicyCommitted(address indexed farmer, bytes32 locationHash);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Only the Oracle can perform this action");
        _;
    }

    constructor(address _verifierAddress) {
        owner = msg.sender;
        verifier = IGroth16Verifier(_verifierAddress);
    }

    function setOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    receive() external payable {
        emit EscrowFunded(msg.sender, msg.value);
    }

    function getPayoutAmount(Tier tier) public pure returns (uint256) {
        if (tier == Tier.Basic) return 0.1 ether;
        if (tier == Tier.Premium) return 0.5 ether;
        if (tier == Tier.Enterprise) return 1.0 ether;
        return 0;
    }

    function commitPolicy(bytes32 locationHash, Tier tier) external {
        require(!isRegistered[msg.sender], "Farmer already registered");
        require(tier != Tier.None, "Invalid tier");
        policyHashes[msg.sender] = locationHash;
        farmerTiers[msg.sender] = tier;
        isRegistered[msg.sender] = true;
        emit PolicyCommitted(msg.sender, locationHash);
    }

    function triggerDisaster(
        uint256 _minLat,
        uint256 _maxLat,
        uint256 _minLon,
        uint256 _maxLon
    ) external onlyOracle returns (uint256) {
        uint256 disasterId = nextDisasterId++;
        disasters[disasterId] = DisasterZone({
            minLat: _minLat,
            maxLat: _maxLat,
            minLon: _minLon,
            maxLon: _maxLon,
            isActive: true
        });
        emit DisasterTriggered(_minLat, _maxLat, _minLon, _maxLon);
        return disasterId;
    }

    function claimPayout(
        uint256 disasterId,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[4] calldata publicInputs
    ) external {
        require(isRegistered[msg.sender], "Farmer is not registered");
        DisasterZone memory activeDisaster = disasters[disasterId];
        require(activeDisaster.isActive, "No active disaster");
        require(!hasClaimed[msg.sender][disasterId], "Already claimed payout");
        
        uint256 payout = getPayoutAmount(farmerTiers[msg.sender]);
        require(address(this).balance >= payout, "Insufficient escrow liquidity");

        // The public inputs array should correspond exactly to the active disaster zone coordinates
        // SnarkJS typically exports public signals in the order they are defined in the circuit
        // Assuming publicInputs: [minLat, maxLat, minLon, maxLon] or similar.
        // Let's verify the passed public inputs exactly match the active disaster bounds.
        require(publicInputs[0] == activeDisaster.minLat, "Mismatch minLat");
        require(publicInputs[1] == activeDisaster.maxLat, "Mismatch maxLat");
        require(publicInputs[2] == activeDisaster.minLon, "Mismatch minLon");
        require(publicInputs[3] == activeDisaster.maxLon, "Mismatch maxLon");

        // Verify zero-knowledge proof
        bool isValid = verifier.verifyProof(a, b, c, publicInputs);
        require(isValid, "Invalid zero-knowledge proof");

        hasClaimed[msg.sender][disasterId] = true;

        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "Transfer failed");

        emit PayoutClaimed(msg.sender, payout);
    }
}
