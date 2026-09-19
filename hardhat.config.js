import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: "0.8.28",
  gasReporter: {
    enabled: true,
    currency: 'USD',
    gasPrice: 20 // Simulated Gwei
  }
};

export default config;
