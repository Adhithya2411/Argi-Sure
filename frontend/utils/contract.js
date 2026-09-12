export const ESCROW_ADDRESS = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"; // Local Hardhat Node typical first deployed contract address

export const ESCROW_ABI = [
  "function commitPolicy(bytes32 locationHash, uint8 tier) external",
  "function isRegistered(address) external view returns (bool)",
  "function disasters(uint256) external view returns (uint256 minLat, uint256 maxLat, uint256 minLon, uint256 maxLon, bool isActive)",
  "function nextDisasterId() external view returns (uint256)",
  "function claimPayout(uint256 disasterId, uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[4] calldata publicInputs) external",
  "function hasClaimed(address, uint256) external view returns (bool)"
];
