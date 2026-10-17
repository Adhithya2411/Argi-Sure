"use client";
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import dynamic from 'next/dynamic';
import { generateProof, hashLocation, toUintLat, toUintLon, fromUintLat, fromUintLon } from '../../utils/zkp';
import { ESCROW_ABI, ESCROW_ADDRESS, LOCAL_ORACLE_ABI, LOCAL_ORACLE_ADDRESS, AGRI_ORACLE_ADDRESS, AGRI_ORACLE_ABI } from '../../utils/contract';
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
  const [syncRequested, setSyncRequested] = useState(false);
  const [isSyncingOracle, setIsSyncingOracle] = useState(false);

  // Geocoding State
  const [searchAddress, setSearchAddress] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      
      checkRegistrationStatus(escrowContract, accounts[0]);
    } catch (err) {
      setError(err.message);
    }
  };

  // Dedicated useEffect for Contract Event Listeners
  useEffect(() => {
    if (contract) {
      const eventSource = getReadEscrow();
      const handlePolicyCommitted = (farmer, locationHash, event) => {
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
          hash: event.log.transactionHash,
          farmer: farmer,
          amount: ethers.formatEther(amount),
          timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
        if (account) checkRegistrationStatus(contract, account);
      };

      const handleDisasterTriggered = (minLat, maxLat, minLon, maxLon, event) => {
        toast.error('Oracle Disaster Triggered On-Chain!', { duration: 5000 });
        if (account) {
          checkRegistrationStatus(contract, account);
          setSyncRequested(true);
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
            checkRegistrationStatus(escrow, accounts[0]);
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
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(`agrisure_farmer_${userAddress.toLowerCase()}`);
          if (cached) {
            const data = JSON.parse(cached);
            if (data.farmPosition && !farmPosition) updateFarmPosition(data.farmPosition);
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
        const currentDisasterId = Number(nextId) - 1;
        const claimed = await escrowContract.hasClaimed(userAddress, currentDisasterId);
        setHasClaimed(claimed);
        
        const disaster = await escrowContract.disasters(currentDisasterId);
        if (disaster.isActive) {
          setActiveDisasterId(currentDisasterId);
          setActiveDisaster({
            minLat: fromUintLat(disaster.minLat),
            maxLat: fromUintLat(disaster.maxLat),
            minLon: fromUintLon(disaster.minLon),
            maxLon: fromUintLon(disaster.maxLon),
          });
          setSyncRequested(true);
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

  // Step 1: Policy Commitment (With Premium Payment)
  const handleCommitPolicy = async () => {
    if (!farmPosition) return setError("Please drop a pin on the map first.");
    if (!farmerName || !farmSize || !cropType) return setError("Please fill out all farm details.");
    if (isSubmitting) return;
    
    setStatus('Generating Poseidon Hash locally...');
    setError('');
    setIsSubmitting(true);
    
    try {
      const lat = farmPosition[0];
      const lon = farmPosition[1];
      const locationHash = await hashLocation(lat, lon);
      
      setStatus(`Hash generated: ${locationHash.substring(0, 15)}... Awaiting wallet signature.`);
      
      const tierInt = parseInt(selectedTier, 10);
      const { web3Provider, signer, escrow: currentContract } = await getWriteContext();
      setContract(currentContract);
      setProvider(web3Provider);

      const premium = await currentContract.getPremiumAmount(tierInt);
      const hashBytes = ethers.zeroPadValue(`0x${locationHash}`, 32);

      // Preflight check
      await getReadEscrow().commitPolicy.staticCall(hashBytes, tierInt, { from: await signer.getAddress(), value: premium });

      const tx = await currentContract.commitPolicy(hashBytes, tierInt, { value: premium });
      setStatus('Transaction submitted. Waiting for confirmation...');
      
      await tx.wait();
      setStatus('Policy Committed successfully!');
      
      // Save metadata locally to maintain state on page reloads
      if (typeof window !== 'undefined') {
        const userAddr = await signer.getAddress();
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

      setIsRegistered(true);
      setPolicyHash(`0x${locationHash}`);
      setIsSubmitting(false);
      toast.success("Policy anchored on-chain with Poseidon hash!");
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

  // Query & Sync Oracle Telemetry
  const handleRequestOracleData = async () => {
    try {
      setIsSyncingOracle(true);
      setStatus('Querying decentralized oracle telemetry...');
      
      // 1. Fetch live USGS seismic telemetry
      try {
        const res = await fetch('/api/disaster-zone');
        const data = await res.json();
        if (data.disasterDetected && data.events && data.events.length > 0) {
          const topEvent = data.events[0];
          toast.success(`Live USGS Telemetry: M${topEvent.magnitude} near ${topEvent.location}`);
        }
      } catch (_) {}

      // 2. Broadcast on-chain Chainlink data request
      const { signer } = await getWriteContext();
      const agriOracle = new ethers.Contract(AGRI_ORACLE_ADDRESS, [
        "function requestDisasterData() public returns (bytes32)"
      ], signer);
      
      const tx = await agriOracle.requestDisasterData();
      setStatus('Chainlink telemetry request broadcasted to blockchain...');
      await tx.wait();
      toast.success("Oracle state synchronized on-chain!");
      setIsSyncingOracle(false);
      setStatus('');
      if (account) checkRegistrationStatus(contract, account);
    } catch (err) {
      console.error(err);
      setIsSyncingOracle(false);
      setError("Failed to sync oracle data: " + (err.message || "Unknown error"));
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

      const { proof, publicSignals, calldata } = await generateProof(
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
                  <div>
                    {hasClaimed ? (
                      <span className={styles.badgeClaimed}>✅ Payout Claimed</span>
                    ) : (
                      <span className={styles.badgeProtected}>🛡️ Active & Protected</span>
                    )}
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
                    Decentralized Oracles continuously monitor global seismic and weather telemetry from the USGS and Chainlink oracle networks. When macro disaster thresholds are breached, verified bounding boxes are committed on-chain.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.5rem 0', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ height: '10px', width: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }}></span>
                      <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Chainlink & USGS Telemetry: <b>Active Monitoring</b></span>
                    </div>

                    <button 
                      onClick={handleRequestOracleData}
                      className={styles.button}
                      style={{ width: 'auto', padding: '0.7rem 1.4rem', fontSize: '0.875rem' }}
                      disabled={isSyncingOracle}
                    >
                      {isSyncingOracle ? 'Querying Oracles...' : '📡 Sync Oracle Telemetry'}
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
