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
  // Navigation State
  const [activeTab, setActiveTab] = useState('farmer'); // 'farmer' | 'authority'

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
  const [showCharts, setShowCharts] = useState(false);
  const [isTriggeringDisaster, setIsTriggeringDisaster] = useState(false);

  // Geocoding State
  const [searchAddress, setSearchAddress] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
            if (data.farmPosition && !farmPosition) setFarmPosition(data.farmPosition);
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
        setFarmPosition([lat, lon]);
        toast.success("Address found! Map updated.");
      } else {
        setError("Address not found. Please try a different query or drop the pin manually.");
      }
    } catch (err) {
      setError("Failed to geocode address.");
    } finally {
      setIsSearching(false);
    }
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

  const handleDemoTriggerDisaster = async () => {
    try {
      setStatus('Requesting Disaster Data from Chainlink Network...');
      const { signer } = await getWriteContext();
      const agriOracle = new ethers.Contract(AGRI_ORACLE_ADDRESS, [
        "function requestDisasterData() public returns (bytes32)"
      ], signer);
      
      const tx = await agriOracle.requestDisasterData();
      setStatus('Transaction submitted. Waiting for Chainlink Node fulfillment...');
      await tx.wait();
      toast.success("Chainlink request broadcasted to AI Oracle.");
      setTimeout(() => setStatus(''), 4000);
    } catch (err) {
      console.error(err);
      setError("Failed to request Chainlink Data: " + (err.message || "Unknown error"));
      setStatus('');
    }
  };

  // Authority Trigger: Direct Austin Demo or Custom Bounding Box
  const handleAuthorityTrigger = async (presetZone) => {
    try {
      if (!window.ethereum) return setError("Please connect MetaMask to broadcast oracle alerts.");
      setIsTriggeringDisaster(true);
      setStatus('Broadcasting Disaster Geometry through AgriSureOracle...');
      const { signer } = await getWriteContext();
      const agriOracle = new ethers.Contract(AGRI_ORACLE_ADDRESS, AGRI_ORACLE_ABI, signer);

      const box = presetZone || [
        toUintLat(30.0),
        toUintLat(30.6),
        toUintLon(-98.0),
        toUintLon(-97.4)
      ];

      const tx = await agriOracle.devTriggerDisaster(...box);
      await tx.wait();
      toast.success("Disaster Zone declared and verified on-chain!");
      setIsTriggeringDisaster(false);
      setStatus('');
      if (account) checkRegistrationStatus(contract, account);
    } catch (err) {
      setIsTriggeringDisaster(false);
      setError("Failed to declare disaster: " + decodeError(err, escrowInterface));
      setStatus('');
    }
  };

  // Authority Action: Fund Escrow Pool
  const handleFundEscrow = async () => {
    try {
      if (!window.ethereum) return setError("Please connect MetaMask to fund escrow.");
      setStatus('Funding Escrow Pool with 2.0 ETH...');
      const { signer } = await getWriteContext();
      const tx = await signer.sendTransaction({
        to: ESCROW_ADDRESS,
        value: ethers.parseEther("2.0")
      });
      await tx.wait();
      toast.success("Funded Escrow with 2.0 ETH!");
      setStatus('');
      if (account) checkRegistrationStatus(contract, account);
    } catch (err) {
      setError("Funding failed: " + err.message);
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
            <button 
              onClick={async () => {
                const { escrow } = await getWriteContext();
                const tx = await escrow.devReset();
                await tx.wait();
                if (typeof window !== 'undefined') {
                  localStorage.removeItem(`agrisure_farmer_${account.toLowerCase()}`);
                }
                window.location.reload();
              }}
              className="text-xs text-red-500 hover:text-red-400 transition-colors bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20"
            >
              [Dev] Reset State
            </button>
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
        {/* Dual-Role Navigation Switcher */}
        <div className={styles.tabNav}>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'farmer' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('farmer')}
          >
            🌾 Farmer Portal
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'authority' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('authority')}
          >
            🏛️ Insurer & Authority Portal
          </button>
        </div>

        {!account && activeTab === 'farmer' ? (
          <div className={styles.authContainer}>
            <h1 className={styles.title}>Decentralized Crop Insurance</h1>
            <p className={styles.subtitle}>Connect your Web3 wallet to manage private parametric policies and verify zero-knowledge claims.</p>
            <button className={styles.button} style={{ maxWidth: '300px' }} onClick={connectWallet}>
              Connect MetaMask
            </button>
          </div>
        ) : activeTab === 'farmer' ? (
          /* ======================================================== */
          /*                    FARMER PORTAL VIEW                    */
          /* ======================================================== */
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
                    🔒 Edge Coordinates Saved Locally: {farmPosition[0].toFixed(4)}°N, {farmPosition[1].toFixed(4)}°W (Never published to blockchain)
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
                  Fill out your farm details and drop a pin on the map. We will compute a cryptographic <b>Poseidon Hash</b> locally in your browser to anchor your location on-chain with an initial premium.
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

                <div className={styles.searchBarContainer}>
                  <input 
                    type="text" 
                    className={styles.input} 
                    placeholder="Search farm address (e.g. Austin, Texas)" 
                    value={searchAddress}
                    onChange={(e) => setSearchAddress(e.target.value)}
                    style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                  />
                  <button 
                    className={styles.button} 
                    style={{ width: 'auto', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                    onClick={handleAddressSearch}
                    disabled={isSearching}
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>

                <MapVisualizer 
                  interactive={true} 
                  position={farmPosition} 
                  setPosition={setFarmPosition} 
                />

                {farmPosition && (
                  <p style={{ marginTop: '1rem', color: '#94a3b8' }}>
                    Selected Coordinates: {farmPosition[0].toFixed(4)}, {farmPosition[1].toFixed(4)} (These will be hashed and never revealed)
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
                    Decentralized Oracles continuously monitor weather sensors and push verified macro disaster geometries onto the blockchain.
                  </div>

                  <div className="mt-8 text-center pt-8 border-t border-gray-800">
                    <button 
                      onClick={handleDemoTriggerDisaster}
                      className={styles.button}
                      style={{ marginBottom: '1.5rem' }}
                    >
                      Request Chainlink Data Sync
                    </button>
                  </div>

                  {activeDisaster ? (
                    <>
                      <MapVisualizer 
                        interactive={false} 
                        position={farmPosition} 
                        disasterZone={activeDisaster}
                      />
                      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0, color: '#f8fafc', fontSize: '0.85rem' }}>
                          Active Red Zone: [{activeDisaster.minLat}° to {activeDisaster.maxLat}°N] × [{activeDisaster.minLon}° to {activeDisaster.maxLon}°W]
                        </p>
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
                    </>
                  ) : (
                    <p style={{ color: '#94a3b8' }}>No active disaster detected on-chain. Regional weather status is normal.</p>
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
        ) : (
          /* ======================================================== */
          /*              INSURER & AUTHORITY PORTAL VIEW             */
          /* ======================================================== */
          <div className={styles.glassCard}>
            <div className={styles.stepHeader}>
              <div className={styles.stepNumber}>🏛️</div>
              <h2 className={styles.stepTitle}>Institutional Authority & Oracle Control Panel</h2>
            </div>

            <div className={styles.infoBox}>
              Manage the decentralized insurance liquidity pool, inspect verified USGS/ML disaster models, and broadcast authenticated weather alerts to the blockchain.
            </div>

            {/* Metrics Row */}
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>{escrowBalance} ETH</div>
                <div className={styles.metricLabel}>Escrow Pool Liquidity</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>96.80%</div>
                <div className={styles.metricLabel}>AI Detection Accuracy</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>0.9888</div>
                <div className={styles.metricLabel}>Model AUC-ROC Score</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>{activeDisaster ? "Active Zone" : "Clear"}</div>
                <div className={styles.metricLabel}>On-Chain Disaster Status</div>
              </div>
            </div>

            {/* AI Model Audit Section */}
            <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem' }}>🧠 Machine Learning Disaster Classifier Audit</h4>
                  <p style={{ margin: '0.2rem 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                    Trained on 10,165 USGS disaster records using Random Forest & Gradient Boosting Ensembles.
                  </p>
                </div>
                <button 
                  className={styles.button} 
                  style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  onClick={() => setShowCharts(!showCharts)}
                >
                  {showCharts ? "Hide Evaluation Charts" : "View AI Evaluation Charts"}
                </button>
              </div>

              {showCharts && (
                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <h5 style={{ margin: 0, color: '#38bdf8' }}>Confusion Matrix</h5>
                    <img src="/charts/confusion_matrix.png" alt="Confusion Matrix" />
                  </div>
                  <div className={styles.chartCard}>
                    <h5 style={{ margin: 0, color: '#38bdf8' }}>ROC Curve (AUC: 0.989)</h5>
                    <img src="/charts/roc_curve.png" alt="ROC Curve" />
                  </div>
                  <div className={styles.chartCard}>
                    <h5 style={{ margin: 0, color: '#38bdf8' }}>Feature Importance</h5>
                    <img src="/charts/feature_importance.png" alt="Feature Importance" />
                  </div>
                </div>
              )}
            </div>

            {/* Oracle Controls */}
            <h4 style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1.1rem' }}>⚡ Oracle Simulation & Protocol Actions</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <button 
                className={styles.button}
                onClick={() => handleAuthorityTrigger([toUintLat(30.0), toUintLat(30.6), toUintLon(-98.0), toUintLon(-97.4)])}
                disabled={isTriggeringDisaster}
              >
                🚨 Trigger Austin Red Zone (30°N, -97.7°W)
              </button>

              <button 
                className={styles.button}
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
                onClick={() => handleAuthorityTrigger([toUintLat(32.5), toUintLat(33.1), toUintLon(-97.2), toUintLon(-96.5)])}
                disabled={isTriggeringDisaster}
              >
                🚨 Trigger Dallas North Zone (32.8°N, -96.8°W)
              </button>

              <button 
                className={styles.button}
                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                onClick={handleFundEscrow}
              >
                💰 Fund Escrow Pool (+2.0 ETH)
              </button>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <BlockchainExplorer events={networkEvents} />
            </div>
          </div>
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
