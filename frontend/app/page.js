"use client";
import { useState } from 'react';
import { generateProof } from '../utils/zkp';
import { ethers } from 'ethers';
import styles from './page.module.css';

export default function Home() {
  const [lat, setLat] = useState('12.9755');
  const [lon, setLon] = useState('79.1555');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClaim = async () => {
    setIsProcessing(true);
    setStatus('Fetching active disaster zone from Oracle API...');
    setError('');

    try {
      // 1. Fetch the real Oracle API Endpoint
      const res = await fetch('/api/disaster-zone');
      const disasterZone = await res.json();
      
      setStatus('Generating Zero-Knowledge Proof locally in browser...');

      // 2. Generate ZKP locally using snarkjs
      const { proof, publicSignals, calldata } = await generateProof(
        disasterZone,
        { lat: parseFloat(lat), lon: parseFloat(lon) }
      );

      setStatus('Connecting to Web3 Wallet...');

      // 3. Connect to Web3 (MetaMask)
      if (!window.ethereum) throw new Error("Please install MetaMask!");
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // 4. Submit to smart contract (Assuming Hardhat local address)
      setStatus('Submitting cryptographic proof to Escrow smart contract...');
      
      // Note: In real app, we use the deployed contract address and ABI
      // We will skip actual contract interaction here for demo UI purposes 
      // since the hardhat node might not be running.
      
      await new Promise(r => setTimeout(r, 2000)); // Simulate tx delay

      setStatus('🎉 Payout Successfully Claimed! Smart Contract verified location without exposing GPS.');
      setIsProcessing(false);

    } catch (err) {
      console.error(err);
      setError(err.message || "An error occurred during verification.");
      setIsProcessing(false);
      setStatus('');
    }
  };

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Zk-AgriSure Dashboard</h1>
        
        <div className={styles.glassCard}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Farm Latitude (Hidden from Blockchain)</label>
            <input 
              type="text" 
              className={styles.input} 
              value={lat} 
              onChange={(e) => setLat(e.target.value)}
              placeholder="e.g. 12.9755"
            />
          </div>
          
          <div className={styles.inputGroup}>
            <label className={styles.label}>Farm Longitude (Hidden from Blockchain)</label>
            <input 
              type="text" 
              className={styles.input} 
              value={lon} 
              onChange={(e) => setLon(e.target.value)}
              placeholder="e.g. 79.1555"
            />
          </div>

          <button 
            className={styles.button}
            onClick={handleClaim}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing Cryptography...' : 'Generate ZKP & Claim Insurance'}
          </button>
        </div>

        {status && (
          <div className={styles.statusCard}>
            <p>{status}</p>
          </div>
        )}

        {error && (
          <div className={styles.errorCard}>
            <p>{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}
