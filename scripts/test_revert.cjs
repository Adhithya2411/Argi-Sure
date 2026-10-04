const { ethers } = require("hardhat");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  
  const txParams = {
    to: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
    from: "0x826b6797452390b61f7426060593df54fba2bc5a",
    data: "0x209ae9de0ad6851b33c6b4dc34aa6e7c57be5566450662221649fa18e4bc98c478f89a0c0000000000000000000000000000000000000000000000000000000000000001",
    gasLimit: "0x493e0"
  };
  
  try {
    console.log("Calling contract directly via eth_call...");
    const result = await provider.call(txParams);
    console.log("Result (no revert!):", result);
  } catch (err) {
    console.error("CALL REVERT REASON:", err);
  }

  try {
    console.log("\nEstimating gas...");
    const gas = await provider.estimateGas(txParams);
    console.log("Estimated Gas:", gas.toString());
  } catch (err) {
    console.error("ESTIMATE GAS REVERT REASON:", err);
  }
}

main().catch(console.error);
