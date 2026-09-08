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
    IGroth16Verifier public verifier;
    
    uint256 public constant PAYOUT_AMOUNT = 0.1 ether;

    struct DisasterZone {
        uint256 minLat;
        uint256 maxLat;
        uint256 minLon;
        uint256 maxLon;
        bool isActive;
    }

    DisasterZone public activeDisaster;
    mapping(address => bool) public hasClaimed;

    event EscrowFunded(address funder, uint256 amount);
    event DisasterTriggered(uint256 minLat, uint256 maxLat, uint256 minLon, uint256 maxLon);
    event PayoutClaimed(address farmer, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    constructor(address _verifierAddress) {
        owner = msg.sender;
        verifier = IGroth16Verifier(_verifierAddress);
    }

    receive() external payable {
        emit EscrowFunded(msg.sender, msg.value);
    }

    function triggerDisaster(
        uint256 _minLat,
        uint256 _maxLat,
        uint256 _minLon,
        uint256 _maxLon
    ) external onlyOwner {
        activeDisaster = DisasterZone({
            minLat: _minLat,
            maxLat: _maxLat,
            minLon: _minLon,
            maxLon: _maxLon,
            isActive: true
        });
        emit DisasterTriggered(_minLat, _maxLat, _minLon, _maxLon);
    }

    function claimPayout(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[4] calldata publicInputs
    ) external {
        require(activeDisaster.isActive, "No active disaster");
        require(!hasClaimed[msg.sender], "Already claimed payout");
        require(address(this).balance >= PAYOUT_AMOUNT, "Insufficient escrow liquidity");

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

        hasClaimed[msg.sender] = true;

        (bool success, ) = msg.sender.call{value: PAYOUT_AMOUNT}("");
        require(success, "Transfer failed");

        emit PayoutClaimed(msg.sender, PAYOUT_AMOUNT);
    }
}
