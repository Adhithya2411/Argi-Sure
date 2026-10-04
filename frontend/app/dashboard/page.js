"use client";
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import dynamic from 'next/dynamic';
import { generateProof, hashLocation, toUintLat, toUintLon, fromUintLat, fromUintLon } from '../../utils/zkp';
import { ESCROW_ABI, ESCROW_ADDRESS, LOCAL_ORACLE_ABI, LOCAL_ORACLE_ADDRESS, AGRI_ORACLE_ADDRESS } from '../../utils/contract';
import { getReadProvider, ensureWalletNetwork, syncWalletWithNode, decodeError } from '../../utils/chain';

const escrowInterface = new ethers.Interface(ESCROW_ABI);
const getReadEscrow = () => new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, getReadProvider());

// Builds a signer-backed escrow contract after making sure MetaMask is on the right chain
// and its block tracker is not stuck on a block from a previous (restarted) local chain.
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
  loading: () => <div style={{ height: '400px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading Map Engine...</div>
});

export default function Dashboard() {
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  
  const [isRegistered, setIsRegistered] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [activeDisaster, setActiveDisaster] = useState(null);
  const [activeDisasterId, setActiveDisasterId] = useState(null); // Keep track of latest disaster ID
  
  // Replace raw string state with tuple state for the map
  const [farmPosition, setFarmPosition] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  
  const [isProcessingZk, setIsProcessingZk] = useState(false);
  const [zkComplete, setZkComplete] = useState(false);
  const [zkLogs, setZkLogs] = useState([]);
  const [networkEvents, setNetworkEvents] = useState([]);
  const [syncRequested, setSyncRequested] = useState(false);

  // Form State
  const [farmerName, setFarmerName] = useState('');
  const [farmSize, setFarmSize] = useState('');
  const [cropType, setCropType] = useState('');
  const [selectedTier, setSelectedTier] = useState('1'); // Default to Basic (1)
  
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
      
      // Note: Event listeners are now handled in a dedicated useEffect to prevent duplicate logs in React Strict Mode.
      checkRegistrationStatus(escrowContract, accounts[0]);
    } catch (err) {
      setError(err.message);
    }
  };

  // Dedicated useEffect for Contract Event Listeners to prevent React Strict Mode duplicates
  useEffect(() => {
    if (contract) {
      // Listen through the direct node provider so events aren't affected by MetaMask's filter cache
      const eventSource = getReadEscrow();
      const handlePolicyCommitted = (farmer, locationHash, event) => {
        toast.success(`Policy Committed for ${farmer.substring(0,6)}...`);
        setNetworkEvents(prev => [{
          type: 'PolicyCommitted',
          hash: locationHash,
          farmer: farmer,
          timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
      };

      const handlePayoutClaimed = (farmer, amount, event) => {
        toast.success(`Payout Claimed! ${ethers.formatEther(amount)} ETH`);
        setNetworkEvents(prev => [{
          type: 'PayoutClaimed (ZK-Verified)',
          hash: event.log.transactionHash, // ethers v6 log property
          farmer: farmer,
          amount: ethers.formatEther(amount),
          timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
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

  // Handle MetaMask account/chain changes for robust UX
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = async (accounts) => {
        if (accounts.length > 0) {
          try {
            // Signer must be rebuilt for the new account
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
      // Reads go directly to the node, never through MetaMask's cached block
      const escrowContract = getReadEscrow();
      const registered = await escrowContract.isRegistered(userAddress);
      setIsRegistered(registered);
      
        const nextId = await escrowContract.nextDisasterId();
        if (nextId > 0) {
          const currentDisasterId = Number(nextId) - 1;
          const claimed = await escrowContract.hasClaimed(userAddress, currentDisasterId);
          setHasClaimed(claimed);
          
          // Fetch disaster zone info from contract
          const disaster = await escrowContract.disasters(currentDisasterId);
          if (disaster.isActive) {
            setActiveDisasterId(currentDisasterId);
            // Decode the offsetted uint coordinates
            setActiveDisaster({
              minLat: fromUintLat(disaster.minLat),
              maxLat: fromUintLat(disaster.maxLat),
              minLon: fromUintLon(disaster.minLon),
              maxLon: fromUintLon(disaster.maxLon),
            });
          }
        }
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

  // Step 1: Policy Commitment
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

      const hashBytes = ethers.zeroPadValue(`0x${locationHash}`, 32);

      // Preflight against the node directly so a revert shows its real reason
      await getReadEscrow().commitPolicy.staticCall(hashBytes, tierInt, { from: await signer.getAddress() });

      const tx = await currentContract.commitPolicy(hashBytes, tierInt);
      setStatus('Transaction submitted. Waiting for confirmation...');
      
      await tx.wait();
      setStatus('Policy Committed successfully!');
      
      setIsRegistered(true);
      setIsSubmitting(false);
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
      
      setStatus('Transaction submitted. Waiting for Chainlink Node to fulfill the request...');
      await tx.wait();
      
      toast.success("Request sent to Chainlink nodes. The AI Oracle will verify the data shortly.");
      setTimeout(() => setStatus(''), 4000);
    } catch (err) {
      console.error(err);
      setError("Failed to request Chainlink Data: " + (err.message || "Unknown error"));
      setStatus('');
    }
  };

  // Step 3: Private Settlement
  const handleClaim = async () => {
    if (!farmPosition) return setError("Please drop a pin on your farm location.");
    setIsProcessingZk(true);
    setZkComplete(false);
    setZkLogs([]);
    setStatus('Starting Zero-Knowledge Edge-Computation Protocol...');
    setError('');

    try {
      const lat = farmPosition[0];
      const lon = farmPosition[1];

      // Format disaster zone to strings scaled down
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
        <Link href="/" className={styles.logo}>Zk-AgriSure Sophisticated Dashboard</Link>
        {account ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button 
              onClick={async () => {
                const { escrow } = await getWriteContext();
                const tx = await escrow.devReset();
                await tx.wait();
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
        {!account ? (
          <div className={styles.authContainer}>
            <h1 className={styles.title}>Farmer Authentication</h1>
            <p className={styles.subtitle}>Please connect your Web3 wallet to access your policy and verify disaster claims securely.</p>
            <button className={styles.button} style={{ maxWidth: '300px' }} onClick={connectWallet}>
              Connect MetaMask
            </button>
          </div>
        ) : !isRegistered ? (
          <div className={styles.glassCard}>
            <div className={styles.stepHeader}>
              <div className={styles.stepNumber}>1</div>
              <h2 className={styles.stepTitle}>Policy Commitment (Anti-Spoofing)</h2>
            </div>
            
            <div className={styles.infoBox}>
              Fill out your farm details and click on the interactive map below to drop a pin on your farm. We will generate a cryptographic <b>Poseidon Hash</b> locally in your browser to anchor your location on-chain.
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
                  <option value="1">Basic (0.1 ETH Payout)</option>
                  <option value="2">Premium (0.5 ETH Payout)</option>
                  <option value="3">Enterprise (1.0 ETH Payout)</option>
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
              {isSubmitting ? 'Processing...' : 'Generate Hash & Commit Policy'}
            </button>
          </div>
        ) : (
          <>
            <div className={styles.glassCard}>
              <div className={styles.stepHeader}>
                <div className={styles.stepNumber}>2</div>
                <h2 className={styles.stepTitle}>Oracle Trigger Monitoring</h2>
              </div>
              
              <div className={styles.infoBox}>
                Chainlink Decentralized Oracle Networks automatically broadcast macro-level disaster geometries from NOAA ML Models.
              </div>

              <div className="mt-8 text-center pt-8 border-t border-gray-800">
                <button 
                  onClick={handleDemoTriggerDisaster}
                  className={styles.button}
                >
                  Request Chainlink Data Sync
                </button>
              </div>

              {activeDisaster && syncRequested ? (
                <>
                  <MapVisualizer 
                    interactive={false} 
                    position={farmPosition} 
                    disasterZone={activeDisaster}
                  />
                  <p style={{ marginTop: '1rem', color: '#f8fafc', fontSize: '0.8rem' }}>
                    Active Red Zone: [{activeDisaster.minLat}, {activeDisaster.maxLat}] x [{activeDisaster.minLon}, {activeDisaster.maxLon}]
                  </p>
                </>
              ) : (
                <p style={{ color: '#94a3b8' }}>No active disaster detected yet. Please request a Chainlink Data Sync.</p>
              )}
            </div>

            <div className={styles.glassCard}>
              <div className={styles.stepHeader}>
                <div className={styles.stepNumber}>3</div>
                <h2 className={styles.stepTitle}>Private Settlement (Zero-Knowledge)</h2>
              </div>

              <div className={styles.infoBox}>
                Your browser will now act as an Edge-Computation node. It will compile the mathematical constraints and prove your farm (from Step 1) is inside the red zone (from Step 2) without revealing the GPS to the network.
              </div>

              {hasClaimed ? (
                <div className={styles.statusCard}>
                  ✅ You have already claimed your payout for this disaster event.
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
