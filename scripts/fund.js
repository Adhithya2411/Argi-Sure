import hre from "hardhat";

// Usage (PowerShell):
//   $env:FUND_ADDRESS="0xYourWallet"; $env:FUND_AMOUNT="1000"; npx hardhat run scripts/fund.js --network localhost
// Sends ETH FROM the local deployer TO the given address. It never signs as the recipient,
// so the recipient's nonce is untouched.
async function main() {
  const to = process.env.FUND_ADDRESS;
  const amount = process.env.FUND_AMOUNT || "1000";
  if (!to || !hre.ethers.isAddress(to)) {
    throw new Error("Set FUND_ADDRESS to the wallet address to fund.");
  }

  const [deployer] = await hre.ethers.getSigners();
  const tx = await deployer.sendTransaction({ to, value: hre.ethers.parseEther(amount) });
  await tx.wait();

  const balance = await hre.ethers.provider.getBalance(to);
  console.log(`Funded ${to} with ${amount} ETH. Balance: ${hre.ethers.formatEther(balance)} ETH`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
