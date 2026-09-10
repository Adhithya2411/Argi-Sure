import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AgriSure", (m) => {
  const verifier = m.contract("Groth16Verifier");
  
  const escrow = m.contract("AgriSureEscrow", [verifier]);

  return { verifier, escrow };
});
