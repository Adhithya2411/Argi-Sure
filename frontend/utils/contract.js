export const AGRI_ORACLE_ADDRESS = "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e";
export const LOCAL_ORACLE_ADDRESS = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";
export const ESCROW_ADDRESS = "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6"; // Local Hardhat Node typical first deployed contract address

export const ESCROW_ABI = [
  "function commitPolicy(bytes32 locationHash, uint8 tier) external",
  "function isRegistered(address) external view returns (bool)",
  "function disasters(uint256) external view returns (uint256 minLat, uint256 maxLat, uint256 minLon, uint256 maxLon, bool isActive)",
  "function nextDisasterId() external view returns (uint256)",
  "function claimPayout(uint256 disasterId, uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[4] calldata publicInputs) external",
  "function hasClaimed(address, uint256) external view returns (bool)"
];

export const LOCAL_ORACLE_ABI = [
  "function fulfillOracleRequest(address callbackAddress, bytes4 callbackFunctionId, bytes32 requestId, uint256 minLat, uint256 maxLat, uint256 minLon, uint256 maxLon) external returns (bool)"
];

export const AGRI_ORACLE_ABI = [
  "function requestDisasterData() external returns (bytes32)"
];
