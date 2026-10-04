const { ethers } = require("hardhat");

async function main() {
  const signer = await ethers.getImpersonatedSigner("0x826b6797452390b61f7426060593df54fba2bc5a");
  
  const txParams = {
    to: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
    data: "0x209ae9de0ad6851b33c6b4dc34aa6e7c57be5566450662221649fa18e4bc98c478f89a0c0000000000000000000000000000000000000000000000000000000000000001",
    gasLimit: "0x493e0"
  };
  
  try {
    const tx = await signer.sendTransaction(txParams);
    console.log("Tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Success!", receipt.status);
  } catch (err) {
    console.error("REVERT REASON:", err);
  }
}

main().catch(console.error);
