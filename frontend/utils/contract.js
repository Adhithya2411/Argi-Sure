export const ESCROW_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Local Hardhat Node typical first deployed contract address

export const ESCROW_ABI = [
  "function commitPolicy(bytes32 locationHash) external",
  "function isRegistered(address) external view returns (bool)",
  "function activeDisaster() external view returns (uint256 minLat, uint256 maxLat, uint256 minLon, uint256 maxLon, bool isActive)",
  "function claimPayout(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[4] calldata publicInputs) external",
  "function hasClaimed(address) external view returns (bool)"
];
