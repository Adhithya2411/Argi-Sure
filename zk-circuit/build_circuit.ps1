# ---------------------------------------------------------------------------
# Rebuilds the ZK circuit end-to-end and syncs every downstream artifact:
#   1. circom compile  (via WSL - the bundled circom binary is a Linux build)
#   2. Groth16 phase-2 setup using the existing pot12_final.ptau
#   3. verification_key.json + contracts/Groth16Verifier.sol
#   4. copies LocationVerifier.wasm + circuit_final.zkey to frontend/public
#   5. regenerates sample input.json / proof.json / public.json
#
# Usage (from repo root):   powershell -ExecutionPolicy Bypass -File zk-circuit/build_circuit.ps1
# ---------------------------------------------------------------------------
$ErrorActionPreference = "Stop"
$zkDir   = $PSScriptRoot
$rootDir = Split-Path $zkDir -Parent

function Invoke-Step($label, [scriptblock]$cmd) {
    Write-Host "`n==> $label" -ForegroundColor Cyan
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "Step failed: $label (exit $LASTEXITCODE)" }
}

# Convert E:\foo\bar -> /mnt/e/foo/bar for WSL
$drive   = $zkDir.Substring(0,1).ToLower()
$wslZk   = "/mnt/$drive" + ($zkDir.Substring(2) -replace '\\','/')
$circom  = Get-Command circom -ErrorAction SilentlyContinue

Push-Location $zkDir
try {
    if ($circom) {
        Invoke-Step "Compiling circuit (native circom)" { circom LocationVerifier.circom --r1cs --wasm --sym -o . }
    } else {
        Invoke-Step "Compiling circuit (circom via WSL)" {
            wsl.exe -d Ubuntu -- bash -lc "cd '$wslZk' && ./circom/target/release/circom LocationVerifier.circom --r1cs --wasm --sym -o ."
        }
    }

    Invoke-Step "Groth16 setup"            { npx snarkjs groth16 setup LocationVerifier.r1cs pot12_final.ptau circuit_0000.zkey }
    $entropy = [guid]::NewGuid().ToString()
    Invoke-Step "Phase-2 contribution"     { npx snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="AgriSure" -e="$entropy" }
    Invoke-Step "Export verification key"  { npx snarkjs zkey export verificationkey circuit_final.zkey verification_key.json }
    Invoke-Step "Export Solidity verifier" { npx snarkjs zkey export solidityverifier circuit_final.zkey (Join-Path $rootDir "contracts\Groth16Verifier.sol") }

    Write-Host "`n==> Copying prover artifacts to frontend/public" -ForegroundColor Cyan
    Copy-Item LocationVerifier_js\LocationVerifier.wasm (Join-Path $rootDir "frontend\public\LocationVerifier.wasm") -Force
    Copy-Item circuit_final.zkey                        (Join-Path $rootDir "frontend\public\circuit_final.zkey") -Force
} finally {
    Pop-Location
}

Push-Location $rootDir
try {
    Invoke-Step "Generating sample proof fixtures" { node scripts/gen_sample_proof.mjs }
} finally {
    Pop-Location
}

Write-Host "`nCircuit rebuilt. Re-run 'npx hardhat compile' and redeploy (npm run deploy)." -ForegroundColor Green
