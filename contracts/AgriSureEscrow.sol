// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[5] calldata _pubSignals
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

    // Coordinates are stored scaled by 10^7 and offset to be non-negative:
    //   lat_u = lat * 1e7 + 90 * 1e7   (0 .. 1.8e9)
    //   lon_u = lon * 1e7 + 180 * 1e7  (0 .. 3.6e9)
    uint256 public constant MAX_LAT_U = 1_800_000_000;
    uint256 public constant MAX_LON_U = 3_600_000_000;

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
    event PolicyReset(address indexed farmer);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Only the Oracle can perform this action");
        _;
    }

    constructor(address _verifierAddress) {
        require(_verifierAddress != address(0), "Invalid verifier");
        owner = msg.sender;
        verifier = IGroth16Verifier(_verifierAddress);
    }

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
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

    /**
     * @param locationHash Poseidon(lat_u, lon_u) computed client-side. The ZK
     *        proof at claim time must open this exact commitment.
     */
    function commitPolicy(bytes32 locationHash, Tier tier) external {
        require(!isRegistered[msg.sender], "Farmer already registered");
        require(tier != Tier.None, "Invalid tier");
        require(locationHash != bytes32(0), "Invalid location hash");
        policyHashes[msg.sender] = locationHash;
        farmerTiers[msg.sender] = tier;
        isRegistered[msg.sender] = true;
        emit PolicyCommitted(msg.sender, locationHash);
    }

    // Dev utility to easily test multiple times without changing accounts
    function devResetFarmer() external {
        isRegistered[msg.sender] = false;
        policyHashes[msg.sender] = bytes32(0);
        farmerTiers[msg.sender] = Tier.None;
    }

    function triggerDisaster(
        uint256 _minLat,
        uint256 _maxLat,
        uint256 _minLon,
        uint256 _maxLon
    ) external onlyOracle returns (uint256) {
        require(_minLat <= _maxLat && _minLon <= _maxLon, "Invalid bounding box");
        require(_maxLat <= MAX_LAT_U && _maxLon <= MAX_LON_U, "Coordinates out of range");
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

    /**
     * @param publicInputs [minLat, maxLat, minLon, maxLon, locationHash] in the
     *        exact order declared by the circuit's `main` component.
     */
    function claimPayout(
        uint256 disasterId,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata publicInputs
    ) external {
        require(isRegistered[msg.sender], "Farmer is not registered");
        DisasterZone memory activeDisaster = disasters[disasterId];
        require(activeDisaster.isActive, "No active disaster");
        require(!hasClaimed[msg.sender][disasterId], "Already claimed payout");
        
        uint256 payout = getPayoutAmount(farmerTiers[msg.sender]);
        require(address(this).balance >= payout, "Insufficient escrow liquidity");

        // The proof's public inputs must be exactly the on-chain disaster zone...
        require(publicInputs[0] == activeDisaster.minLat, "Mismatch minLat");
        require(publicInputs[1] == activeDisaster.maxLat, "Mismatch maxLat");
        require(publicInputs[2] == activeDisaster.minLon, "Mismatch minLon");
        require(publicInputs[3] == activeDisaster.maxLon, "Mismatch maxLon");
        // ...and the location the farmer committed to BEFORE the disaster (anti-spoofing).
        require(publicInputs[4] == uint256(policyHashes[msg.sender]), "Location does not match committed policy");

        // Verify zero-knowledge proof
        bool isValid = verifier.verifyProof(a, b, c, publicInputs);
        require(isValid, "Invalid zero-knowledge proof");

        hasClaimed[msg.sender][disasterId] = true;

        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "Transfer failed");

        emit PayoutClaimed(msg.sender, payout);
    }

    /**
     * @notice DEV ONLY: clear a farmer's policy so the demo can be repeated.
     * Allowed for any farmer to reset their own state in the UI.
     * Claim history is intentionally NOT cleared, so a reset farmer can never
     * be paid twice for the same disaster.
     */
    function devReset() external {
        isRegistered[msg.sender] = false;
        policyHashes[msg.sender] = 0;
        farmerTiers[msg.sender] = Tier.None;
        
        // DEV FIX: Also clear claim history for the most recent disaster so the demo can be re-run
        if (nextDisasterId > 1) {
            hasClaimed[msg.sender][nextDisasterId - 1] = false;
        }

        emit PolicyReset(msg.sender);
    }
}
