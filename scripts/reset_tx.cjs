const { ethers } = require("hardhat");

async function main() {
  const signer = await ethers.getImpersonatedSigner("0x826b6797452390b61f7426060593df54fba2bc5a");
  
  const abi = ["function devReset() external"];
  const contract = new ethers.Contract("0xe7f1725e7734ce288f8367e1bb143e90bb3f0512", abi, signer);
  
  try {
    const tx = await contract.devReset();
    console.log("Tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Success Reset!", receipt.status);
  } catch (err) {
    console.error("REVERT REASON:", err);
  }
}

main().catch(console.error);
