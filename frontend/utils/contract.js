export const ESCROW_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
export const LOCAL_ORACLE_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
export const AGRI_ORACLE_ADDRESS = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";

// ---------- AgriSureEscrow ABI (includes events) ----------
export const ESCROW_ABI = [
  // Functions
  "function commitPolicy(bytes32 locationHash, uint8 tier) external",
  "function isRegistered(address) external view returns (bool)",
  "function disasters(uint256) external view returns (uint256 minLat, uint256 maxLat, uint256 minLon, uint256 maxLon, bool isActive)",
  "function nextDisasterId() external view returns (uint256)",
  "function getPayoutAmount(uint8 tier) public pure returns (uint256)",
  "function devReset() external",
  "function claimPayout(uint256 disasterId, uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[4] calldata publicInputs) external",
  "function hasClaimed(address, uint256) external view returns (bool)",
  // Events — required for contract.on() listeners
  "event PolicyCommitted(address indexed farmer, bytes32 locationHash)",
  "event DisasterTriggered(uint256 minLat, uint256 maxLat, uint256 minLon, uint256 maxLon)",
  "event PayoutClaimed(address farmer, uint256 amount)",
  "event EscrowFunded(address funder, uint256 amount)",
  "event OracleUpdated(address oldOracle, address newOracle)"
];

// ---------- LocalOracle ABI ----------
export const LOCAL_ORACLE_ABI = [
  "function fulfillOracleRequest(address callbackAddress, bytes4 callbackFunctionId, bytes32 requestId, uint256 minLat, uint256 maxLat, uint256 minLon, uint256 maxLon) external returns (bool)"
];

// ---------- AgriSureOracle ABI ----------
export const AGRI_ORACLE_ABI = [
  "function requestDisasterData() external returns (bytes32)",
  "function devTriggerDisaster(uint256 _minLat, uint256 _maxLat, uint256 _minLon, uint256 _maxLon) external"
];

// ---------- Coordinate Offset Helpers ----------
// Solidity uint256 cannot hold negative numbers. GPS longitudes can be negative
// (e.g., Austin TX = -97.7). The Circom circuit uses unsigned LessEqThan(64).
// Solution: Shift all coordinates to a non-negative range before on-chain storage.
//   Latitude  += 90  * 10^7  (range: -90..+90   → 0..1_800_000_000)
//   Longitude += 180 * 10^7  (range: -180..+180  → 0..3_600_000_000)
export const LAT_OFFSET = 900000000;   // 90 * 10^7
export const LON_OFFSET = 1800000000;  // 180 * 10^7
export const SCALE_FACTOR = 10000000;  // 10^7
