# Zk-AgriSure — Project Status & Architecture Documentation

> **Last Updated:** 2026-09-12  
> **Repository:** https://github.com/Adhithya2411/Argi-Sure  
> **Purpose:** This document serves as the single source of truth for the entire project. It covers the architecture, every file, what has been implemented, what is NOT yet implemented, known bugs, and what remains for future work. Any AI or developer reading this should be able to fully understand the project state without asking questions.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure & File-by-File Breakdown](#3-directory-structure--file-by-file-breakdown)
4. [Architecture Deep Dive](#4-architecture-deep-dive)
5. [How to Run the Project Locally](#5-how-to-run-the-project-locally)
6. [What Is Fully Implemented (Done)](#6-what-is-fully-implemented-done)
7. [What Is NOT Implemented / Known Gaps](#7-what-is-not-implemented--known-gaps)
8. [Known Bugs & Issues](#8-known-bugs--issues)
9. [Datasets Used](#9-datasets-used)
10. [Future Implementation Roadmap](#10-future-implementation-roadmap)
11. [Git Commit History (Milestones)](#11-git-commit-history-milestones)

---

## 1. Project Overview

**Zk-AgriSure** is a decentralized parametric crop insurance protocol that uses **Zero-Knowledge Proofs (ZKPs)** to allow farmers to claim disaster insurance payouts **without revealing their exact GPS coordinates** to the blockchain.

### The Core Problem
Traditional parametric insurance requires farmers to submit their precise farm location to a centralized insurer. This creates privacy risks (land surveillance, data breaches) and trust issues (centralized middlemen controlling claims).

### The Solution
Zk-AgriSure replaces the centralized model with a fully trustless, on-chain system:

1. **Policy Commitment (Anti-Spoofing):** The farmer's browser locally computes a **Poseidon hash** of their GPS coordinates. Only this irreversible hash is stored on-chain, so the farmer cannot change their location after a disaster occurs.

2. **Oracle Trigger:** When a disaster happens, a Chainlink Decentralized Oracle Network broadcasts the macro-level bounding box of the disaster zone (e.g., `minLat`, `maxLat`, `minLon`, `maxLon`) to the smart contract.

3. **Private Settlement (ZK Proof):** The farmer's browser locally generates a **Groth16 Zero-Knowledge Proof** that mathematically proves their farm's GPS lies inside the disaster bounding box, without revealing the actual coordinates. The proof is submitted to the smart contract, which verifies it on-chain using elliptic curve pairings and releases the insurance payout automatically.

### Key Innovation
ZK circuits operate on **finite-field arithmetic** and cannot process floating-point numbers (like GPS coordinates `12.9755`). We solve this by scaling all GPS values by a factor of **10^7** (10,000,000), converting them into large integers compatible with the R1CS constraint system. This is a concrete, publishable technical contribution.

---

## 2. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Smart Contracts** | Solidity | ^0.8.24 | On-chain escrow, verification, oracle integration |
| **Blockchain Framework** | Hardhat | ^2.29.1 | Local EVM node, compilation, deployment, testing |
| **Deployment** | Hardhat Ignition | (bundled) | Declarative contract deployment |
| **ZK Circuits** | Circom | 2.1.6 | Define R1CS constraints for location verification |
| **ZK Proving** | SnarkJS | ^0.7.6 | Groth16 proof generation and verification |
| **ZK Library** | circomlib | (bundled) | Pre-audited comparator circuits (`LessEqThan`) |
| **Hashing** | circomlibjs | ^0.1.7 | Poseidon hash computation in JavaScript |
| **Frontend Framework** | Next.js (App Router) | 16.3.4 | SSR/CSR React application |
| **React** | React | 19.2.8 | UI components |
| **Web3 Integration** | Ethers.js | ^6.17.0 | MetaMask connection, contract interaction |
| **Mapping** | React-Leaflet + Leaflet | ^5.0.0 / ^1.9.4 | Interactive geospatial map |
| **Oracle (Production)** | Chainlink | ^0.8.0 | Decentralized data feeds (not active on local) |
| **Data Ingestion** | Python 3 (urllib) | — | Pull real USGS disaster data |
| **Styling** | Vanilla CSS Modules | — | Glassmorphism, dark mode, responsive |

---

## 3. Directory Structure & File-by-File Breakdown

```
project_workspace/
├── contracts/                      # Solidity smart contracts
│   ├── AgriSureEscrow.sol          # Core escrow contract (DEPLOYED, WORKING)
│   ├── AgriSureOracle.sol          # Chainlink oracle integration (NOT DEPLOYED locally)
│   └── Groth16Verifier.sol         # Auto-generated ZK verifier (DEPLOYED, WORKING)
│
├── zk-circuit/                     # Circom ZK circuit and compiled artifacts
│   ├── LocationVerifier.circom     # The ZK circuit source code (COMPILED)
│   ├── LocationVerifier.r1cs       # Compiled R1CS constraint system
│   ├── LocationVerifier.sym        # Symbol file for debugging
│   ├── LocationVerifier_js/        # Contains LocationVerifier.wasm (WebAssembly prover)
│   ├── circuit_0000.zkey           # Phase 1 proving key
│   ├── circuit_final.zkey          # Phase 2 (production) proving key
│   ├── verification_key.json       # Public verification key
│   ├── pot12_*.ptau                # Powers of Tau ceremony files (trusted setup)
│   ├── input.json                  # Sample test input for the circuit
│   ├── proof.json                  # Sample generated proof
│   ├── public.json                 # Sample public signals (disaster bounding box)
│   └── witness.wtns                # Sample computed witness
│
├── frontend/                       # Next.js web application
│   ├── app/
│   │   ├── layout.js               # Root layout (HTML head, body wrapper)
│   │   ├── globals.css             # Global CSS reset and base styles
│   │   ├── page.js                 # Landing page (/) with hero section + feature cards
│   │   ├── page.module.css         # Landing page styles
│   │   └── dashboard/
│   │       ├── page.js             # Main farmer dashboard (/dashboard) — ALL LOGIC HERE
│   │       ├── dashboard.module.css # Premium glassmorphism styles for dashboard
│   │       └── components/
│   │           ├── MapVisualizer.js      # React-Leaflet interactive map component
│   │           ├── ZkTerminal.js         # Hacker-style ZK computation visualizer
│   │           └── BlockchainExplorer.js # Live on-chain event feed component
│   │
│   ├── utils/
│   │   ├── zkp.js                  # ZK proof generation + Poseidon hashing logic
│   │   └── contract.js             # Contract ABI and deployed address constants
│   │
│   ├── package.json                # Frontend dependencies (next, react, ethers, snarkjs, etc.)
│   └── next.config.mjs             # Next.js configuration
│
├── scripts/
│   ├── setup.js                    # Post-deployment setup (funds escrow, sets oracle, triggers disaster)
│   └── dataset_ingestion.py        # Real USGS data ingestion pipeline
│
├── datasets/
│   └── USGS_Severe_Earthquakes_*.json  # Real downloaded dataset (52 severe events)
│
├── test/
│   └── AgriSureEscrow.test.js      # Hardhat unit tests for the escrow contract
│
├── ignition/modules/
│   └── AgriSure.js                 # Hardhat Ignition deployment module
│
├── artifacts/                      # Auto-generated Hardhat compilation artifacts
├── cache/                          # Hardhat cache
├── hardhat.config.js               # Hardhat configuration (Solidity 0.8.24)
├── package.json                    # Root dependencies (hardhat, snarkjs, ethers, chainlink)
└── .gitignore
```

---

## 4. Architecture Deep Dive

### 4.1 The Zero-Knowledge Circuit (`LocationVerifier.circom`)

The circuit defines 6 signals:
- **4 PUBLIC inputs** (`min_lat`, `max_lat`, `min_lon`, `max_lon`) — the Oracle's disaster bounding box
- **2 PRIVATE inputs** (`farmer_lat`, `farmer_lon`) — the farmer's hidden GPS

It uses four 64-bit `LessEqThan` comparators from circomlib to enforce:
```
min_lat <= farmer_lat <= max_lat
min_lon <= farmer_lon <= max_lon
```

All values are **pre-scaled by 10^7** before entering the circuit (e.g., latitude `12.9755` becomes `129755000`).

The circuit was compiled through the full Groth16 setup:
1. `circom LocationVerifier.circom --r1cs --wasm --sym`
2. Powers of Tau ceremony (`pot12_final.ptau`)
3. Phase 2 key generation (`circuit_final.zkey`)
4. Verification key export (`verification_key.json`)
5. Solidity verifier generation → `Groth16Verifier.sol`

### 4.2 Smart Contracts

**`Groth16Verifier.sol`** (8,226 bytes)
- Auto-generated by SnarkJS from the compiled circuit
- Contains the elliptic curve pairing verification logic
- Exposes `verifyProof(uint[2] a, uint[2][2] b, uint[2] c, uint[4] pubSignals) → bool`

**`AgriSureEscrow.sol`** (3,999 bytes)
- The core business logic contract
- **`commitPolicy(bytes32 locationHash)`**: Farmer registers by submitting a Poseidon hash of their GPS. Stored immutably. Prevents post-disaster location spoofing.
- **`triggerDisaster(minLat, maxLat, minLon, maxLon)`**: Called by the Oracle (or owner during testing) to set the active disaster bounding box.
- **`claimPayout(a, b, c, publicInputs)`**: Farmer submits ZK proof. Contract verifies: (a) farmer is registered, (b) disaster is active, (c) hasn't already claimed, (d) public inputs match active disaster, (e) ZK proof is mathematically valid. If all pass, sends `0.1 ETH` payout.
- **`setOracle(address)`**: Owner sets the trusted oracle address.
- **`receive()`**: Allows the contract to receive ETH funding.

**`AgriSureOracle.sol`** (3,817 bytes)
- Chainlink integration contract using `ChainlinkClient`
- Configured for Sepolia testnet (LINK token address, oracle address, job ID)
- **`requestDisasterData()`**: Sends a Chainlink request to fetch disaster geometry from an API
- **`fulfillDisasterData()`**: Callback that receives the 4-coordinate bounding box and calls `escrow.triggerDisaster()`
- **STATUS: Written but NOT deployed.** On local Hardhat, we bypass this by calling `triggerDisaster()` directly from the owner account via `setup.js`.

### 4.3 Frontend Application

**Landing Page (`/`)**
- Hero section with gradient text title "Privacy-Preserving Crop Insurance Architecture"
- Three feature cards: Geospatial Privacy, Discrete Scaling, Edge-Computation
- "Connect Wallet to Enter App" CTA button → navigates to `/dashboard`

**Dashboard (`/dashboard`)**
- Full farmer workflow in 3 steps:
  - **Step 1 — Policy Commitment**: Interactive Leaflet map. Farmer clicks to drop a pin. Browser computes Poseidon hash via `circomlibjs`. Hash is submitted to `commitPolicy()` on the smart contract.
  - **Step 2 — Oracle Monitoring**: Displays the active disaster bounding box as a red polygon overlay on the map. Data comes from the smart contract's `activeDisaster()` view function.
  - **Step 3 — Private Settlement**: Farmer clicks "Generate ZKP & Claim Insurance". The `ZkTerminal` component streams a visual log of the computation. The browser loads the WASM prover and `.zkey` file, generates the Groth16 proof, and submits it to `claimPayout()`.

**Components:**
- `MapVisualizer.js`: Wraps `react-leaflet`. Supports interactive mode (click to place marker) and display mode (show marker + disaster rectangle). Uses OpenStreetMap tiles. Disaster polygon has a pulsating red glow animation.
- `ZkTerminal.js`: Simulated terminal output showing the ZK computation steps. Features macOS-style window buttons (red/yellow/green dots), monospace `Fira Code` font, neon green text, blinking block cursor, glassmorphism container.
- `BlockchainExplorer.js`: Displays on-chain events as styled cards. Shows event type badges, actor addresses (truncated), policy hashes, and payout amounts.

### 4.4 Middleware (`frontend/utils/`)

**`zkp.js`**:
- `scaleCoordinate(coord)`: Multiplies GPS float by 10^7, rounds to integer string.
- `hashLocation(lat, lon)`: Builds Poseidon hash using `circomlibjs`. Returns hex string for Solidity `bytes32`.
- `generateProof(disasterZone, farmerLocation)`: Calls `snarkjs.groth16.fullProve()` with the WASM file and `.zkey` from the `/public` directory. Returns proof arrays formatted for the Solidity verifier.

**`contract.js`**:
- Exports `ESCROW_ADDRESS` (hardcoded to local Hardhat's first deployment address: `0x5FbDB2315678afecb367f032d93F642f64180aa3`)
- Exports `ESCROW_ABI` as a human-readable ABI array for Ethers.js

### 4.5 Scripts

**`setup.js`** (Hardhat script):
1. Funds the escrow contract with 1 ETH
2. Sets the Oracle role to the deployer's own address (for local testing)
3. Reads `zk-circuit/public.json` and calls `triggerDisaster()` with those values

**`dataset_ingestion.py`** (Python):
1. Fetches LIVE data from USGS Earthquake API (`earthquake.usgs.gov`)
2. Filters for severe events (Magnitude >= 5.5)
3. Creates 4-point bounding boxes around epicenters
4. Scales all coordinates by 10^7 for ZK circuit compatibility
5. Saves as JSON in `datasets/`

### 4.6 Tests

**`AgriSureEscrow.test.js`** (Hardhat/Chai):
- Tests contract deployment
- Tests policy commitment
- Tests disaster triggering
- Tests claim payout flow

---

## 5. How to Run the Project Locally

### Prerequisites
- Node.js v18+
- Python 3.x
- MetaMask browser extension

### Step-by-Step

```bash
# Terminal 1: Start local blockchain
cd project_workspace
npx hardhat node
# This prints 20 test accounts with 10,000 ETH each.
# Keep this terminal open.

# Terminal 2: Deploy contracts
cd project_workspace
npx hardhat ignition deploy ignition/modules/AgriSure.js --network localhost
# Then run the setup script to fund escrow and trigger a test disaster:
npx hardhat run scripts/setup.js --network localhost

# Terminal 3: Start frontend
cd project_workspace/frontend
npm run dev
# Opens at http://localhost:3000
```

### MetaMask Setup
1. Add network: Name=`Localhost 8545`, RPC URL=`http://127.0.0.1:8545`, Chain ID=`31337`, Symbol=`ETH`
2. Import a test account: Copy any private key from Terminal 1's output
3. Switch MetaMask to the `Localhost 8545` network

### Important Note About MetaMask Warnings
MetaMask will flag imported Hardhat test accounts as "compromised" because their private keys are publicly known. This is expected and safe for local testing. These accounts have zero value on any real network.

---

## 6. What Is Fully Implemented (Done)

| Module | Status | Details |
|--------|--------|---------|
| ZK Circuit (`LocationVerifier.circom`) | ✅ Complete | Compiled, trusted setup done, WASM + zkey generated, Solidity verifier exported |
| `Groth16Verifier.sol` | ✅ Complete | Auto-generated, deployed on local Hardhat |
| `AgriSureEscrow.sol` | ✅ Complete | Full logic: commitPolicy, triggerDisaster, claimPayout with ZK verification |
| `AgriSureOracle.sol` | ⚠️ Written, NOT deployed | Chainlink integration code exists but requires Sepolia/mainnet to function |
| Hardhat Ignition Deployment | ✅ Complete | `ignition/modules/AgriSure.js` deploys Verifier → Escrow |
| `setup.js` | ✅ Complete | Funds escrow, sets oracle, triggers test disaster |
| Poseidon Hashing (`zkp.js`) | ✅ Complete | Browser-side Poseidon hash for anti-spoofing |
| ZK Proof Generation (`zkp.js`) | ✅ Complete | Browser-side Groth16 fullProve via WASM |
| Landing Page (`/`) | ✅ Complete | Hero, features section, CTA to dashboard |
| Dashboard UI (`/dashboard`) | ✅ Complete | 3-step flow with glassmorphism cards |
| Interactive Map (`MapVisualizer`) | ✅ Complete | Click-to-place GPS pin, red zone polygon with glow |
| ZK Terminal (`ZkTerminal`) | ✅ Complete | Hacker terminal aesthetic, blinking cursor, glassmorphism |
| Blockchain Explorer (`BlockchainExplorer`) | ✅ Complete | Card-based event feed with status badges |
| Dataset Ingestion (`dataset_ingestion.py`) | ✅ Complete | Real USGS API, 52 severe events downloaded |
| Unit Tests | ✅ Complete | `AgriSureEscrow.test.js` covers core flows |
| Premium Dark Mode CSS | ✅ Complete | Glassmorphism, radial gradients, responsive |

---

## 7. What Is NOT Implemented / Known Gaps

| Feature | Status | Notes |
|---------|--------|-------|
| **ML Model Training** | ❌ Not started | Datasets collected (USGS). No ML model exists yet. Planned: LSTM or Random Forest on NOAA Storm Events + USDA Crop Yield data to predict disaster bounding boxes. |
| **Authority / Admin Dashboard** | ❌ Not started | A separate interface for institutional administrators to monitor climate telemetry, trigger disasters, and view escrow liquidity. |
| **Chainlink Oracle on Testnet** | ❌ Not functional locally | `AgriSureOracle.sol` exists but Chainlink requires Sepolia + LINK tokens. On local Hardhat, disaster is triggered manually via `setup.js`. |
| **WASM + zkey in `/public`** | ⚠️ Must be manually copied | For the browser ZK proof to work, `LocationVerifier.wasm` and `circuit_final.zkey` must be manually copied from `zk-circuit/` into `frontend/public/`. This step is easy to forget. |
| **Farmer Sign-Up / Login Flow** | ❌ Not implemented | No dedicated sign-up page with farmer profile fields (name, farm size, crop type). Currently, the "login" is just MetaMask wallet connection. |
| **Multiple Disaster Events** | ❌ Not implemented | The contract only supports ONE active disaster at a time. No history of past disasters. |
| **Dynamic Payout Calculation** | ❌ Not implemented | Payout is hardcoded to `0.1 ETH`. No dynamic calculation based on farm size, crop type, or disaster severity. |
| **Mobile Responsiveness** | ⚠️ Partial | CSS has `@media (max-width: 768px)` rules but not thoroughly tested on real mobile devices. |
| **End-to-End Testing** | ⚠️ Not fully verified | The full flow (connect wallet → commit policy → trigger disaster → generate ZK proof → claim payout) has not been tested end-to-end in a single session due to MetaMask gas estimation issues on the local network. |

---

## 8. Known Bugs & Issues

1. **MetaMask Gas Estimation Failure on Localhost:** MetaMask sometimes fails to estimate gas for transactions on the local Hardhat node (shows "gas fee is not met" or "insufficient funds"). This appears to be a MetaMask nonce caching issue when the Hardhat node is restarted. **Workaround:** In MetaMask → Settings → Advanced → Clear Activity Tab Data, then retry.

2. **MetaMask "Scam Warning" on Imported Accounts:** Importing Hardhat's default private keys triggers MetaMask's built-in scam detector because these keys are publicly known. This is cosmetic and does not affect functionality.

3. **ZkTerminal is Simulated:** The `ZkTerminal.js` component displays a pre-written sequence of log messages (e.g., "Loading WASM module...", "Solving R1CS constraints...") on a timer. It does NOT display the actual real-time output from `snarkjs.groth16.fullProve()`. The actual proof generation happens silently in `onZkTerminalComplete()` after the terminal animation finishes.

4. **BlockchainExplorer Shows Mock Data on Load:** When no real events have been emitted yet, the explorer shows two hardcoded placeholder entries ("Contract Deployed" and "Oracle Trigger"). These are not real blockchain events.

5. **WASM/ZKEY Files Not in `/public`:** If the `LocationVerifier.wasm` and `circuit_final.zkey` files are not manually copied to `frontend/public/`, the browser-side proof generation will fail with a 404 error.

6. **`AgriSureOracle.sol` Cannot Compile on Local Hardhat Without Full Chainlink:** The Chainlink imports may cause compilation issues if the `@chainlink/contracts` dependency has version conflicts. This contract is not used in local testing.

---

## 9. Datasets Used

### Currently Implemented
| Dataset | Source | Link | Status |
|---------|--------|------|--------|
| USGS Real-Time Earthquake GeoJSON | United States Geological Survey | https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php | ✅ Downloaded, 10,964 events fetched, 52 severe filtered |

### Planned for ML Training (Review 3)
| Dataset | Source | Link | Purpose |
|---------|--------|------|---------|
| NOAA Storm Events Database | National Oceanic and Atmospheric Administration | https://www.ncdc.noaa.gov/stormevents/ | Historical severe weather events for training disaster prediction model |
| USDA NASS Crop Statistics | United States Department of Agriculture | https://www.nass.usda.gov/Data_and_Statistics/ | Crop yield data to correlate weather events with agricultural damage |
| NASA SMAP Soil Moisture | NASA Jet Propulsion Laboratory | https://smap.jpl.nasa.gov/data/ | Real-time satellite telemetry for live ML inference |

---

## 10. Future Implementation Roadmap

### Phase 1: ML Model (Review 3)
- Train a predictive climate anomaly model (LSTM or Random Forest) on NOAA + USDA data
- Model output: 4-point geospatial bounding box of predicted agricultural disaster
- Integrate model predictions with the Chainlink Oracle contract

### Phase 2: Authority Dashboard
- Separate admin interface for institutional overseers
- Features: live climate telemetry visualization, manual disaster trigger controls, escrow liquidity monitoring, farmer registry viewer

### Phase 3: Testnet Deployment
- Deploy all contracts (Escrow + Verifier + Oracle) to Ethereum Sepolia testnet
- Fund Oracle contract with LINK tokens
- Test full Chainlink integration with a real API endpoint

### Phase 4: Enhanced Features
- Farmer profile system (name, farm size, crop type)
- Dynamic payout calculation based on severity and coverage
- Multi-disaster support (historical record of past events)
- Notification system for farmers when a disaster is triggered

### Phase 5: Research Publication
- Target: IEEE/ACM conference or Q1/Q2 Scopus-indexed journal
- Focus: Novel application of ZKPs for geospatial privacy in DeFi parametric insurance
- Key contribution: Integer-scaling methodology for finite-field arithmetic on continuous GPS telemetry

---

## 11. Git Commit History (Milestones)

| # | Commit Message | Key Changes |
|---|---------------|-------------|
| 1 | Initial commit | Base Hardhat project, Solidity contracts, Circom circuit |
| 2 | Milestone: Sophisticated UI Overhaul with Leaflet Map, ZK Terminal, Explorer, and Dataset Ingestion Script | Added react-leaflet map, ZkTerminal, BlockchainExplorer, dataset_ingestion.py, dashboard page |
| 3 | Milestone: Premium UI/UX Overhaul with Dark Mode and Glassmorphism | Complete CSS overhaul, glassmorphism cards, radar polygon glow, hacker terminal aesthetic, real USGS dataset |

---

## Quick Reference: Key Contract Addresses (Local Hardhat)

| Contract | Address |
|----------|---------|
| Groth16Verifier | First deployed (auto-assigned by Ignition) |
| AgriSureEscrow | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |

## Quick Reference: Hardhat Test Accounts

The Hardhat node generates 20 deterministic accounts, each with 10,000 ETH. The first few:

| Account | Address | Private Key |
|---------|---------|-------------|
| #0 (Owner) | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

> ⚠️ **WARNING:** These keys are publicly known. Never send real funds to these addresses.
