"use client";
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import dynamic from 'next/dynamic';
import { generateProof, hashLocation } from '../../utils/zkp';
import { ESCROW_ABI, ESCROW_ADDRESS } from '../../utils/contract';
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
  
  // Replace raw string state with tuple state for the map
  const [farmPosition, setFarmPosition] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  
  const [isProcessingZk, setIsProcessingZk] = useState(false);
  const [zkComplete, setZkComplete] = useState(false);
  const [zkLogs, setZkLogs] = useState([]);
  const [networkEvents, setNetworkEvents] = useState([]);

  // Form State
  const [farmerName, setFarmerName] = useState('');
  const [farmSize, setFarmSize] = useState('');
  const [cropType, setCropType] = useState('');
  const [selectedTier, setSelectedTier] = useState('1'); // Default to Basic (1)

  // 1. Web3 Authentication
  const connectWallet = async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask!");
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);

      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(web3Provider);
      
      const signer = await web3Provider.getSigner();
      const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
      setContract(escrowContract);
      
      // Setup event listeners
      escrowContract.on("PolicyCommitted", (farmer, locationHash, event) => {
        toast.success(`Policy Committed for ${farmer.substring(0,6)}...`);
        setNetworkEvents(prev => [{
          type: 'PolicyCommitted',
          hash: locationHash,
          farmer: farmer,
          timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
      });

      escrowContract.on("PayoutClaimed", (farmer, amount, event) => {
        toast.success(`Payout Claimed! ${ethers.formatEther(amount)} ETH`);
        setNetworkEvents(prev => [{
          type: 'PayoutClaimed (ZK-Verified)',
          hash: event.log.transactionHash,
          farmer: farmer,
          amount: ethers.formatEther(amount),
          timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
      });

      escrowContract.on("DisasterTriggered", (minLat, maxLat, minLon, maxLon, event) => {
        toast.error('NOAA Disaster Triggered On-Chain!', { duration: 5000 });
        checkRegistrationStatus(escrowContract, accounts[0]);
      });

      checkRegistrationStatus(escrowContract, accounts[0]);
    } catch (err) {
      setError(err.message);
    }
  };

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      if (contract) {
        contract.removeAllListeners("PolicyCommitted");
        contract.removeAllListeners("PayoutClaimed");
        contract.removeAllListeners("DisasterTriggered");
      }
    };
  }, [contract]);

  const checkRegistrationStatus = async (escrowContract, userAddress) => {
    try {
      const registered = await escrowContract.isRegistered(userAddress);
      setIsRegistered(registered);
      
      if (registered) {
        const claimed = await escrowContract.hasClaimed(userAddress);
        setHasClaimed(claimed);
        
        // Fetch disaster zone info from contract
        const disaster = await escrowContract.activeDisaster();
        if (disaster.isActive) {
          // Note: Dividing by 10^7 because contract stores scaled ints
          setActiveDisaster({
            minLat: Number(disaster.minLat) / 10000000,
            maxLat: Number(disaster.maxLat) / 10000000,
            minLon: Number(disaster.minLon) / 10000000,
            maxLon: Number(disaster.maxLon) / 10000000,
          });
        }
      }
    } catch (err) {
      console.error("Error reading from contract", err);
    }
  };

  // Step 1: Policy Commitment
  const handleCommitPolicy = async () => {
    if (!farmPosition) return setError("Please drop a pin on the map first.");
    if (!farmerName || !farmSize || !cropType) return setError("Please fill out all farm details.");
    
    setStatus('Generating Poseidon Hash locally...');
    setError('');
    
    try {
      const lat = farmPosition[0];
      const lon = farmPosition[1];
      const locationHash = await hashLocation(lat, lon);
      
      setStatus(`Hash generated: ${locationHash.substring(0, 15)}... Awaiting wallet signature.`);
      
      const tierInt = parseInt(selectedTier, 10);
      const tx = await contract.commitPolicy(`0x${locationHash}`, tierInt, { gasLimit: 300000 });
      setStatus('Transaction submitted. Waiting for confirmation...');
      
      await tx.wait();
      setStatus('Policy Committed successfully!');
      
      setIsRegistered(true);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to commit policy");
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
      
      const tx = await contract.claimPayout(
        calldata.a, 
        calldata.b, 
        calldata.c, 
        calldata.Input,
        { gasLimit: 500000 }
      );
      
      await tx.wait();

      setStatus('🎉 Payout Successfully Claimed! Smart Contract verified location without exposing GPS.');
      setZkComplete(true);
      setHasClaimed(true);
      setIsProcessingZk(false);

    } catch (err) {
      console.error(err);
      setError("An error occurred during verification. Ensure your farm is inside the active red zone.");
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
          <div className={styles.walletBadge}>
            {account.substring(0, 6)}...{account.substring(account.length - 4)}
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
              disabled={!farmPosition}
              style={{ marginTop: '1.5rem' }}
            >
              Generate Hash & Commit Policy
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

              {activeDisaster ? (
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
                <p style={{ color: '#94a3b8' }}>No active disaster detected by Oracle.</p>
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
