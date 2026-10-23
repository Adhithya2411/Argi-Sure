"use client";
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import dynamic from 'next/dynamic';
import { generateProof, hashLocation, fromUintLat, fromUintLon } from '../../utils/zkp';
import { ESCROW_ABI, ESCROW_ADDRESS } from '../../utils/contract';
import { getReadProvider, ensureWalletNetwork, syncWalletWithNode, decodeError } from '../../utils/chain';

const escrowInterface = new ethers.Interface(ESCROW_ABI);
const getReadEscrow = () => new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, getReadProvider());

// Builds a signer-backed escrow contract after ensuring network and sync
async function getWriteContext() {
  await ensureWalletNetwork();
  const sync = await syncWalletWithNode();
  if (sync.resynced) {
    console.info(`Resynced wallet block tracker (wallet was at ${sync.walletBlock}, node now at ${sync.nodeBlock}).`);
  }
  const web3Provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await web3Provider.getSigner();
  return { web3Provider, signer, escrow: new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signer) };
}

import styles from './dashboard.module.css';
import Link from 'next/link';
import { Toaster, toast } from 'react-hot-toast';

import ZkTerminal from './components/ZkTerminal';
import BlockchainExplorer from './components/BlockchainExplorer';

// Dynamically import map so it doesn't break SSR
const MapVisualizer = dynamic(() => import('./components/MapVisualizer'), { 
  ssr: false,
  loading: () => (
    <div style={{ height: '400px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading Geospatial Engine...
    </div>
  )
});

export default function Dashboard() {
  // Location Input Mode & Coordinates
  const [locationInputMode, setLocationInputMode] = useState('address'); // 'address' | 'coords'
  const [inputLat, setInputLat] = useState('');
  const [inputLon, setInputLon] = useState('');

  // Web3 & Contract State
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [escrowBalance, setEscrowBalance] = useState('0.00');
  
  // Farmer Status
  const [isRegistered, setIsRegistered] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [policyHash, setPolicyHash] = useState('');
  const [activeDisaster, setActiveDisaster] = useState(null);
  const [activeDisasterId, setActiveDisasterId] = useState(null);
  
  // Geospatial & Form State
  const [farmPosition, setFarmPosition] = useState(null);
  const [farmerName, setFarmerName] = useState('');
  const [farmSize, setFarmSize] = useState('');
  const [cropType, setCropType] = useState('');
  const [selectedTier, setSelectedTier] = useState('1'); // 1 = Basic, 2 = Premium, 3 = Enterprise
  
  // UI & Feedback
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isProcessingZk, setIsProcessingZk] = useState(false);
  const [zkComplete, setZkComplete] = useState(false);
  const [zkLogs, setZkLogs] = useState([]);
  const [networkEvents, setNetworkEvents] = useState([]);
  const [isSyncingOracle, setIsSyncingOracle] = useState(false);

  // Geocoding State
  const [searchAddress, setSearchAddress] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountBalance, setAccountBalance] = useState(null);
  const [currentChainId, setCurrentChainId] = useState(null);

  const refreshAccountDetails = async (userAddr, web3Provider) => {
    try {
      const p = web3Provider || (window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
      if (!p || !userAddr) return;
      const [bal, net] = await Promise.all([
        p.getBalance(userAddr),
        p.getNetwork()
      ]);
      setAccountBalance(ethers.formatEther(bal));
      setCurrentChainId(Number(net.chainId));
    } catch (_) {}
  };

  const updateFarmPosition = (pos) => {
    setFarmPosition(pos);
    if (pos && pos.length === 2) {
      setInputLat(pos[0].toFixed(6));
      setInputLon(pos[1].toFixed(6));
    }
  };

  // 1. Web3 Authentication
  const connectWallet = async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask!");
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

      const code = await getReadProvider().getCode(ESCROW_ADDRESS);
      if (code === '0x') {
        throw new Error(`No AgriSureEscrow contract at ${ESCROW_ADDRESS} on the node. Run the deploy script against this node.`);
      }

      const { web3Provider, escrow: escrowContract } = await getWriteContext();
      setAccount(accounts[0]);
      setProvider(web3Provider);
      setContract(escrowContract);
      await refreshAccountDetails(accounts[0], web3Provider);
      await checkRegistrationStatus(escrowContract, accounts[0]);
    } catch (err) {
      setError(err.message);
    }
  };

  // Dedicated useEffect for Contract Event Listeners
  useEffect(() => {
    if (contract) {
      const eventSource = getReadEscrow();
      const handlePolicyCommitted = (farmer, locationHash) => {
        toast.success(`Policy Committed for ${farmer.substring(0,6)}...`);
        setNetworkEvents(prev => [{
          type: 'PolicyCommitted',
          hash: locationHash,
          farmer: farmer,
          timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
        if (account) checkRegistrationStatus(contract, account);
      };

      const handlePayoutClaimed = (farmer, amount, event) => {
        toast.success(`Payout Claimed! ${ethers.formatEther(amount)} ETH`);
        setNetworkEvents(prev => [{
          type: 'PayoutClaimed (ZK-Verified)',
          hash: event?.log?.transactionHash || '0x...',
          farmer: farmer,
          amount: ethers.formatEther(amount),
          timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
        if (account) checkRegistrationStatus(contract, account);
      };

      const handleDisasterTriggered = (minLat, maxLat, minLon, maxLon) => {
        toast.error('Oracle Disaster Triggered On-Chain!', { duration: 5000 });
        if (account) {
          checkRegistrationStatus(contract, account);
        }
      };

      eventSource.on("PolicyCommitted", handlePolicyCommitted);
      eventSource.on("PayoutClaimed", handlePayoutClaimed);
      eventSource.on("DisasterTriggered", handleDisasterTriggered);

      return () => {
        eventSource.removeAllListeners();
      };
    }
  }, [contract, account]);

  // Handle MetaMask account/chain changes
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = async (accounts) => {
        if (accounts.length > 0) {
          try {
            const { web3Provider, escrow } = await getWriteContext();
            setAccount(accounts[0]);
            setProvider(web3Provider);
            setContract(escrow);
            await checkRegistrationStatus(escrow, accounts[0]);
          } catch (e) {
            setError(e.message);
          }
        } else {
          setAccount('');
          setIsRegistered(false);
          setContract(null);
        }
      };
      
      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  const checkRegistrationStatus = async (_unused, userAddress) => {
    try {
      const escrowContract = getReadEscrow();
      const registered = await escrowContract.isRegistered(userAddress);
      setIsRegistered(registered);

      // Restore client-side metadata from localStorage for seamless persistence
      let cachedPosition = farmPosition;
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(`agrisure_farmer_${userAddress.toLowerCase()}`);
          if (cached) {
            const data = JSON.parse(cached);
            if (data.farmPosition && !farmPosition) {
              updateFarmPosition(data.farmPosition);
              cachedPosition = data.farmPosition;
            }
            if (data.farmerName && !farmerName) setFarmerName(data.farmerName);
            if (data.farmSize && !farmSize) setFarmSize(data.farmSize);
            if (data.cropType && !cropType) setCropType(data.cropType);
            if (data.selectedTier) setSelectedTier(String(data.selectedTier));
          }
        } catch (_) {}
      }

      if (registered) {
        try {
          const onChainHash = await escrowContract.policyHashes(userAddress);
          setPolicyHash(onChainHash);
          const tier = await escrowContract.farmerTiers(userAddress);
          if (tier > 0) setSelectedTier(String(tier));
        } catch (_) {}
      }
      
      const nextId = await escrowContract.nextDisasterId();
      if (nextId > 0) {
        let matchedDisaster = null;
        let matchedId = null;

        for (let i = Number(nextId) - 1; i >= 1; i--) {
          try {
            const d = await escrowContract.disasters(i);
            if (d.isActive) {
              const minLatF = fromUintLat(d.minLat);
              const maxLatF = fromUintLat(d.maxLat);
              const minLonF = fromUintLon(d.minLon);
              const maxLonF = fromUintLon(d.maxLon);
              const zone = { minLat: minLatF, maxLat: maxLatF, minLon: minLonF, maxLon: maxLonF };

              const posToCheck = cachedPosition || farmPosition;
              if (posToCheck &&
                  posToCheck[0] >= minLatF && posToCheck[0] <= maxLatF &&
                  posToCheck[1] >= minLonF && posToCheck[1] <= maxLonF) {
                matchedDisaster = zone;
                matchedId = i;
                break;
              } else if (!matchedDisaster) {
                matchedDisaster = zone;
                matchedId = i;
              }
            }
          } catch (_) {}
        }

        if (matchedDisaster) {
          setActiveDisasterId(matchedId);
          setActiveDisaster(matchedDisaster);
          const claimed = await escrowContract.hasClaimed(userAddress, matchedId);
          setHasClaimed(claimed);
        }
      }

      // Update escrow liquidity
      const directProvider = getReadProvider();
      const bal = await directProvider.getBalance(ESCROW_ADDRESS);
      setEscrowBalance(Number(ethers.formatEther(bal)).toFixed(3));
    } catch (err) {
      console.error("Error reading from contract", err);
    }
  };

  // Address Geocoding using Nominatim (OpenStreetMap)
  const handleAddressSearch = async () => {
    if (!searchAddress) return;
    setIsSearching(true);
    setError('');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        updateFarmPosition([lat, lon]);
        toast.success("Address found! Map updated.");
      } else {
        setError("Address not found. Please try a different query or enter coordinates directly.");
      }
    } catch (err) {
      setError("Failed to geocode address.");
    } finally {
      setIsSearching(false);
    }
  };

  // Direct Coordinate Entry Handler
  const handleApplyCoordinates = () => {
    const lat = parseFloat(inputLat);
    const lon = parseFloat(inputLon);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError("Latitude must be a valid number between -90 and 90.");
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setError("Longitude must be a valid number between -180 and 180.");
      return;
    }
    setError('');
    updateFarmPosition([lat, lon]);
    toast.success(`Coordinates applied: [${lat.toFixed(4)}, ${lon.toFixed(4)}]`);
  };

  // Step 1: Policy Commitment (With Premium Payment) + Dynamic Oracle Synchronization
  const handleCommitPolicy = async () => {
    if (!farmPosition) return setError("Please specify or drop a pin on your farm location.");
    if (!farmerName || !farmSize || !cropType) return setError("Please fill out all farm details.");
    if (isSubmitting) return;
    
    setStatus('Generating Poseidon Hash locally in browser...');
    setError('');
    setIsSubmitting(true);
    
    try {
      const lat = farmPosition[0];
      const lon = farmPosition[1];
      const locationHash = await hashLocation(lat, lon);
      
      setStatus(`Poseidon Hash generated: 0x${locationHash.substring(0, 12)}... Awaiting wallet signature.`);
      
      const tierInt = parseInt(selectedTier, 10);
      const { web3Provider, signer, escrow: currentContract } = await getWriteContext();
      setContract(currentContract);
      setProvider(web3Provider);

      const premium = await currentContract.getPremiumAmount(tierInt);
      const userAddr = await signer.getAddress();
      const balance = await web3Provider.getBalance(userAddr);
      if (balance < premium) {
        throw new Error(`Insufficient funds: Your connected account (${userAddr.substring(0, 6)}...${userAddr.substring(userAddr.length - 4)}) has ${Number(ethers.formatEther(balance)).toFixed(4)} Sepolia ETH, but Tier ${tierInt} requires a premium of ${ethers.formatEther(premium)} ETH. Please choose Tier 1 (0.01 ETH) or fund your wallet with Sepolia ETH.`);
      }
      const hashBytes = ethers.zeroPadValue(`0x${locationHash}`, 32);

      // Preflight check
      await getReadEscrow().commitPolicy.staticCall(hashBytes, tierInt, { from: userAddr, value: premium });

      const tx = await currentContract.commitPolicy(hashBytes, tierInt, { value: premium });
      setStatus('Policy commit transaction submitted. Waiting for confirmation on Sepolia...');
      
      await tx.wait();
      
      // Save metadata locally to maintain state on page reloads
      if (typeof window !== 'undefined') {
        const payload = {
          account: userAddr.toLowerCase(),
          farmerName,
          farmSize,
          cropType,
          selectedTier,
          farmPosition: [lat, lon],
          locationHash: `0x${locationHash}`
        };
        localStorage.setItem(`agrisure_farmer_${userAddr.toLowerCase()}`, JSON.stringify(payload));
      }

      setStatus('Policy committed on-chain! Oracle verifying regional disaster telemetry...');

      // Dynamic Oracle Sync: ensure the verified disaster bounding box covering this farm exists on-chain
      try {
        const oracleRes = await fetch('/api/oracle-trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lon })
        });
        const oracleData = await oracleRes.json();
        if (oracleData.success && oracleData.boundingBox) {
          setActiveDisaster(oracleData.boundingBox);
          if (oracleData.disasterId) setActiveDisasterId(oracleData.disasterId);
        }
      } catch (oracleErr) {
        console.warn("Oracle dynamic sync note:", oracleErr);
      }

      setIsRegistered(true);
      setPolicyHash(`0x${locationHash}`);
      await checkRegistrationStatus(currentContract, userAddr);
      setIsSubmitting(false);
      setStatus('');
      toast.success("Policy committed & disaster telemetry synced dynamically on-chain!");
    } catch (err) {
      setIsSubmitting(false);
      console.error(err);
      if (err?.code === 'ACTION_REJECTED') {
        setError('Transaction rejected in wallet.');
      } else {
        setError('Commit failed: ' + decodeError(err, escrowInterface));
      }
      setStatus('');
    }
  };

  // Reset Policy (Allows developer/user to test from Step 1 repeatedly without changing accounts)
  const handleResetPolicy = async () => {
    try {
      setStatus("Resetting farmer registration on Sepolia smart contract...");
      setError('');
      const { escrow, signer } = await getWriteContext();
      const userAddr = await signer.getAddress();
      const tx = await escrow.devResetFarmer();
      await tx.wait();

      if (typeof window !== 'undefined') {
        localStorage.removeItem(`agrisure_farmer_${userAddr.toLowerCase()}`);
      }
      setIsRegistered(false);
      setPolicyHash('');
      setHasClaimed(false);
      setActiveDisaster(null);
      setActiveDisasterId(null);
      setStatus("Policy reset! You can now commit a new policy in Step 1.");
      toast.success("Policy reset successfully!");
    } catch (err) {
      console.error(err);
      setError("Failed to reset policy: " + decodeError(err, escrowInterface));
      setStatus('');
    }
  };

  // Step 3: Private Settlement via Client-Side ZK Proof
  const handleClaim = async () => {
    if (!farmPosition) return setError("Please specify or drop a pin on your farm location.");
    setIsProcessingZk(true);
    setZkComplete(false);
    setZkLogs([]);
    setStatus('Starting Zero-Knowledge Edge-Computation Protocol...');
    setError('');

    try {
      const lat = farmPosition[0];
      const lon = farmPosition[1];

      const dZone = {
        minLat: activeDisaster.minLat.toString(),
        maxLat: activeDisaster.maxLat.toString(),
        minLon: activeDisaster.minLon.toString(),
        maxLon: activeDisaster.maxLon.toString(),
      };

      const { calldata } = await generateProof(
        dZone,
        { lat, lon },
        (msg) => setZkLogs(prev => [...prev, msg])
      );

      setStatus('Submitting cryptographic proof to Escrow smart contract...');
      
      const { signer, escrow } = await getWriteContext();
      const claimArgs = [activeDisasterId, calldata.a, calldata.b, calldata.c, calldata.Input];
      await getReadEscrow().claimPayout.staticCall(...claimArgs, { from: await signer.getAddress() });
      const tx = await escrow.claimPayout(...claimArgs);
      
      await tx.wait();

      setStatus('🎉 Payout Successfully Claimed! Smart Contract verified location without exposing GPS.');
      setZkComplete(true);
      setHasClaimed(true);
      setIsProcessingZk(false);
      toast.success("Insurance claim verified and paid out!");
    } catch (err) {
      console.error(err);
      if (err.message && err.message.includes("Already claimed")) {
        setError("You have already claimed your insurance payout for this disaster.");
        setHasClaimed(true);
      } else {
        setError("Claim failed: " + decodeError(err, escrowInterface));
      }
      setIsProcessingZk(false);
      setStatus('');
    }
  };

  const getTierLabel = (tier) => {
    if (tier === '1') return "Basic Tier (0.1 ETH Payout)";
    if (tier === '2') return "Premium Tier (0.5 ETH Payout)";
    if (tier === '3') return "Enterprise Tier (1.0 ETH Payout)";
    return "Standard Coverage";
  };

  const isFarmInDisaster = activeDisaster && farmPosition && (
    farmPosition[0] >= activeDisaster.minLat &&
    farmPosition[0] <= activeDisaster.maxLat &&
    farmPosition[1] >= activeDisaster.minLon &&
    farmPosition[1] <= activeDisaster.maxLon
  );

  return (
    <div className={styles.container}>
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.1)'
          }
        }}
      />
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>Zk-AgriSure Protocol</Link>
        {account ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div 
              onClick={currentChainId !== 11155111 ? ensureWalletNetwork : undefined}
              style={{ 
                fontSize: '0.8rem', 
                padding: '0.35rem 0.75rem', 
                borderRadius: '20px', 
                background: currentChainId === 11155111 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.2)',
                color: currentChainId === 11155111 ? '#4ade80' : '#fca5a5',
                border: `1px solid ${currentChainId === 11155111 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.5)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: currentChainId !== 11155111 ? 'pointer' : 'default',
                fontWeight: 600
              }}
              title={currentChainId !== 11155111 ? 'Click to switch MetaMask to Sepolia' : 'Connected to Sepolia Testnet'}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: currentChainId === 11155111 ? '#4ade80' : '#ef4444' }}></span>
              {currentChainId === 11155111 ? 'Sepolia Testnet' : (currentChainId === 31337 ? 'Localhost (Click to switch to Sepolia)' : 'Switch to Sepolia')}
            </div>
            {accountBalance !== null && (
              <div style={{ fontSize: '0.85rem', color: '#e2e8f0', background: 'rgba(255,255,255,0.06)', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                Balance: <strong>{Number(accountBalance).toFixed(4)} ETH</strong>
              </div>
            )}
            <div className={styles.walletBadge}>
              {account.substring(0, 6)}...{account.substring(account.length - 4)}
            </div>
          </div>
        ) : (
          <button className={styles.button} style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={connectWallet}>
            Connect Wallet
          </button>
        )}
      </header>

      <main className={styles.main}>
        {!account ? (
          <div className={styles.authContainer}>
            <h1 className={styles.title}>Decentralized Crop Insurance</h1>
            <p className={styles.subtitle}>Connect your Web3 wallet to manage private parametric policies and verify zero-knowledge claims.</p>
            <button className={styles.button} style={{ maxWidth: '300px' }} onClick={connectWallet}>
              Connect MetaMask
            </button>
          </div>
        ) : (
          <>
            {/* Active Policy Card (Shown once committed) */}
            {isRegistered && (
              <div className={styles.policyBanner}>
                <div className={styles.policyHeader}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Your Active Crop Insurance Policy</h3>
                    <p style={{ margin: '0.2rem 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>Secured by Groth16 Zero-Knowledge Commitment</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {hasClaimed ? (
                      <span className={styles.badgeClaimed}>✅ Payout Claimed</span>
                    ) : (
                      <span className={styles.badgeProtected}>🛡️ Active & Protected</span>
                    )}
                    <button 
                      type="button" 
                      onClick={handleResetPolicy} 
                      title="Reset your on-chain registration to test committing from Step 1 again"
                      style={{ 
                        background: 'rgba(239, 68, 68, 0.15)', 
                        border: '1px solid rgba(239, 68, 68, 0.35)', 
                        color: '#fca5a5', 
                        borderRadius: '8px', 
                        padding: '0.35rem 0.75rem', 
                        fontSize: '0.8rem', 
                        cursor: 'pointer',
                        fontWeight: 500
                      }}
                    >
                      🔄 Reset Policy (Test Mode)
                    </button>
                  </div>
                </div>

                <div className={styles.policyGrid}>
                  <div>
                    <div className={styles.policyFieldLabel}>Coverage Plan</div>
                    <div className={styles.policyFieldValue}>{getTierLabel(selectedTier)}</div>
                  </div>
                  <div>
                    <div className={styles.policyFieldLabel}>Policy Holder</div>
                    <div className={styles.policyFieldValue}>{farmerName || "Verified Farmer"} ({farmSize || "50"} Acres)</div>
                  </div>
                  <div>
                    <div className={styles.policyFieldLabel}>Insured Crop</div>
                    <div className={styles.policyFieldValue}>{cropType || "Grain / Wheat"}</div>
                  </div>
                  <div>
                    <div className={styles.policyFieldLabel}>Location Commitment (Poseidon)</div>
                    <div className={styles.policyFieldValue} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {policyHash ? `${policyHash.substring(0, 10)}...${policyHash.substring(policyHash.length - 8)}` : "Committed On-Chain"}
                    </div>
                  </div>
                </div>

                {farmPosition && (
                  <p style={{ marginTop: '1rem', color: '#38bdf8', fontSize: '0.8rem' }}>
                    🔒 Edge Coordinates Saved Locally: {farmPosition[0].toFixed(6)}°N, {farmPosition[1].toFixed(6)}°W (Never published to blockchain)
                  </p>
                )}
              </div>
            )}

            {!isRegistered ? (
              <div className={styles.glassCard}>
                <div className={styles.stepHeader}>
                  <div className={styles.stepNumber}>1</div>
                  <h2 className={styles.stepTitle}>Policy Commitment (Anti-Spoofing)</h2>
                </div>
                
                <div className={styles.infoBox}>
                  Fill out your farm details and specify your location. We will compute a cryptographic <b>Poseidon Hash</b> locally in your browser to anchor your location on-chain with an initial premium payment.
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.inputGroup}>
                    <label className={styles.label}>Full Name</label>
                    <input 
                      type="text" 
                      className={styles.input} 
                      placeholder="John Doe" 
                      value={farmerName}
                      onChange={(e) => setFarmerName(e.target.value)}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label className={styles.label}>Farm Size (Acres)</label>
                    <input 
                      type="number" 
                      className={styles.input} 
                      placeholder="50" 
                      value={farmSize}
                      onChange={(e) => setFarmSize(e.target.value)}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label className={styles.label}>Crop Type</label>
                    <input 
                      type="text" 
                      className={styles.input} 
                      placeholder="Wheat" 
                      value={cropType}
                      onChange={(e) => setCropType(e.target.value)}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label className={styles.label}>Insurance Tier</label>
                    <select 
                      className={`${styles.input} ${styles.selectInput}`}
                      value={selectedTier}
                      onChange={(e) => setSelectedTier(e.target.value)}
                    >
                      <option value="1">Basic — 0.01 ETH Premium (0.1 ETH Payout)</option>
                      <option value="2">Premium — 0.05 ETH Premium (0.5 ETH Payout)</option>
                      <option value="3">Enterprise — 0.10 ETH Premium (1.0 ETH Payout)</option>
                    </select>
                  </div>
                </div>

                {/* Geospatial Location Input: Address Search OR Exact Coordinates */}
                <div className={styles.locationSelectorContainer}>
                  <div className={styles.locationHeader}>
                    <label className={styles.label} style={{ margin: 0 }}>Farm Geospatial Location</label>
                    <div className={styles.locationModeToggle}>
                      <button 
                        type="button"
                        className={`${styles.modeBtn} ${locationInputMode === 'address' ? styles.modeBtnActive : ''}`}
                        onClick={() => setLocationInputMode('address')}
                      >
                        🔍 Search Place Name
                      </button>
                      <button 
                        type="button"
                        className={`${styles.modeBtn} ${locationInputMode === 'coords' ? styles.modeBtnActive : ''}`}
                        onClick={() => setLocationInputMode('coords')}
                      >
                        🌐 Enter Exact Lat & Lon
                      </button>
                    </div>
                  </div>

                  {locationInputMode === 'address' ? (
                    <div className={styles.searchBarContainer} style={{ marginBottom: 0 }}>
                      <input 
                        type="text" 
                        className={styles.input} 
                        placeholder="Search city, village, or farm address (e.g. Austin, Texas or Khuzdar)" 
                        value={searchAddress}
                        onChange={(e) => setSearchAddress(e.target.value)}
                        style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                      />
                      <button 
                        type="button"
                        className={styles.button} 
                        style={{ width: 'auto', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                        onClick={handleAddressSearch}
                        disabled={isSearching}
                      >
                        {isSearching ? 'Searching...' : 'Search'}
                      </button>
                    </div>
                  ) : (
                    <div className={styles.coordsInputRow}>
                      <div style={{ flex: 1, minWidth: '160px' }}>
                        <label className={styles.subLabel}>Latitude (-90° to +90°)</label>
                        <input 
                          type="number" 
                          step="any"
                          className={styles.input} 
                          placeholder="e.g. 30.2672" 
                          value={inputLat}
                          onChange={(e) => setInputLat(e.target.value)}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: '160px' }}>
                        <label className={styles.subLabel}>Longitude (-180° to +180°)</label>
                        <input 
                          type="number" 
                          step="any"
                          className={styles.input} 
                          placeholder="e.g. -97.7431" 
                          value={inputLon}
                          onChange={(e) => setInputLon(e.target.value)}
                        />
                      </div>
                      <button 
                        type="button"
                        className={styles.button} 
                        style={{ width: 'auto', padding: '1rem 1.6rem', whiteSpace: 'nowrap' }}
                        onClick={handleApplyCoordinates}
                      >
                        📍 Set Pin on Map
                      </button>
                    </div>
                  )}
                </div>

                <MapVisualizer 
                  interactive={true} 
                  position={farmPosition} 
                  setPosition={updateFarmPosition} 
                />

                {farmPosition && (
                  <p style={{ marginTop: '1rem', color: '#94a3b8' }}>
                    Selected Farm Coordinates: <b>{farmPosition[0].toFixed(6)}°N, {farmPosition[1].toFixed(6)}°E/W</b> (These will be hashed with Poseidon and never revealed)
                  </p>
                )}

                <button 
                  className={styles.button}
                  onClick={handleCommitPolicy}
                  disabled={!farmPosition || isSubmitting}
                  style={{ marginTop: '1.5rem' }}
                >
                  {isSubmitting ? 'Processing...' : 'Pay Premium & Commit Policy'}
                </button>
              </div>
            ) : (
              <>
                <div className={styles.glassCard}>
                  <div className={styles.stepHeader}>
                    <div className={styles.stepNumber}>2</div>
                    <h2 className={styles.stepTitle}>Oracle Disaster Monitoring</h2>
                  </div>
                  
                  <div className={styles.infoBox}>
                    Decentralized Oracles continuously monitor global seismic and climate telemetry from USGS government sensor networks and Chainlink. When macro disaster thresholds are breached, verified bounding boxes are committed on-chain.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.5rem 0', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ height: '10px', width: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }}></span>
                      <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Decentralized Oracles & USGS: <b>Active Background Telemetry</b></span>
                    </div>

                    <button 
                      type="button"
                      disabled={isSyncingOracle}
                      onClick={async () => {
                        if (contract && account) {
                          try {
                            setIsSyncingOracle(true);
                            if (farmPosition) {
                              toast.loading("Syncing with Oracle network...", { id: 'sync' });
                              await fetch('/api/oracle-trigger', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ lat: farmPosition[0], lon: farmPosition[1] })
                              });
                              await checkRegistrationStatus(contract, account);
                              toast.success("Telemetry synchronized with blockchain!", { id: 'sync' });
                            } else {
                              await checkRegistrationStatus(contract, account);
                              toast.success("Telemetry refreshed!", { id: 'sync' });
                            }
                          } catch (e) {
                            toast.error("Sync failed", { id: 'sync' });
                          } finally {
                            setIsSyncingOracle(false);
                          }
                        }
                      }}
                      className={styles.button}
                      style={{ width: 'auto', padding: '0.6rem 1.1rem', fontSize: '0.825rem', background: 'rgba(255,255,255,0.08)' }}
                    >
                      {isSyncingOracle ? 'Syncing...' : '🔄 Sync Telemetry'}
                    </button>
                  </div>

                  {activeDisaster ? (
                    <>
                      <MapVisualizer 
                        interactive={false} 
                        position={farmPosition} 
                        disasterZone={activeDisaster}
                      />
                      <div style={{ marginTop: '1.25rem', padding: '1.2rem', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verified On-Chain Disaster Zone</div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc', marginTop: '0.2rem' }}>
                            [{activeDisaster.minLat.toFixed(4)}°N, {activeDisaster.minLon.toFixed(4)}°E] to [{activeDisaster.maxLat.toFixed(4)}°N, {activeDisaster.maxLon.toFixed(4)}°E]
                          </div>
                        </div>
                        <div>
                          {isFarmInDisaster ? (
                            <span className={styles.badgeClaimed} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                              🚨 Farm In Disaster Zone (Eligible)
                            </span>
                          ) : (
                            <span className={styles.badgeProtected}>
                              🛡️ Farm Outside Disaster Zone
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
                        ✅ Regional Status Normal. No qualifying disaster thresholds currently breached.
                      </p>
                    </div>
                  )}
                </div>

                <div className={styles.glassCard}>
                  <div className={styles.stepHeader}>
                    <div className={styles.stepNumber}>3</div>
                    <h2 className={styles.stepTitle}>Private Settlement (Zero-Knowledge)</h2>
                  </div>

                  <div className={styles.infoBox}>
                    Your browser computes the Groth16 cryptographic proof showing your private farm location lies inside the disaster bounding box without revealing your coordinates.
                  </div>

                  {hasClaimed ? (
                    <div className={styles.statusCard}>
                      ✅ Payout Successfully Claimed for this disaster event!
                    </div>
                  ) : (
                    <>
                      {!isProcessingZk && (
                        <button 
                          className={styles.button}
                          onClick={handleClaim}
                          disabled={isProcessingZk || !activeDisaster}
                        >
                          Generate ZKP & Claim Insurance
                        </button>
                      )}
                      
                      <ZkTerminal 
                        isProcessing={isProcessingZk} 
                        logs={zkLogs} 
                      />
                    </>
                  )}
                </div>
                
                <BlockchainExplorer events={networkEvents} />
              </>
            )}
          </>
        )}

        {status && (
          <div className={styles.statusCard} style={{ marginTop: '2rem', width: '100%' }}>
            <p>{status}</p>
          </div>
        )}

        {error && (
          <div className={styles.errorCard} style={{ marginTop: '2rem', width: '100%' }}>
            <p>{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}
