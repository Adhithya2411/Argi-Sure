"use client";
import { useState, useEffect } from 'react';

export default function ZkTerminal({ isProcessing, onComplete }) {
  const [logs, setLogs] = useState([]);
  
  const mockLogs = [
    "[INFO] Initializing WebAssembly Circom Engine...",
    "[INFO] Loading LocationVerifier.wasm...",
    "[INFO] Loading zkey proving key (2.4MB)...",
    "[DEBUG] Scaling GPS Float Telemetry by 10^7 factor...",
    "[DEBUG] Compiling discrete inputs to Rank-1 Constraint System (R1CS)...",
    "[INFO] Constraint solving: LessEqThan[0] -> Valid",
    "[INFO] Constraint solving: LessEqThan[1] -> Valid",
    "[INFO] Constraint solving: LessEqThan[2] -> Valid",
    "[INFO] Constraint solving: LessEqThan[3] -> Valid",
    "[DEBUG] Generating cryptographic polynomial witness...",
    "[INFO] Witness generation complete (260 non-linear constraints).",
    "[INFO] Executing Groth16 Proving protocol...",
    "[SUCCESS] Zero-Knowledge Proof generated: 300 bytes.",
    "[INFO] Exporting Solidity calldata for Escrow settlement..."
  ];

  useEffect(() => {
    if (!isProcessing) {
      setLogs([]);
      return;
    }

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < mockLogs.length) {
        setLogs(prev => [...prev, mockLogs[currentIndex]]);
        currentIndex++;
      } else {
        clearInterval(interval);
        if (onComplete) onComplete();
      }
    }, 400); // add a new log every 400ms

    return () => clearInterval(interval);
  }, [isProcessing]);

  if (!isProcessing && logs.length === 0) return null;

  return (
    <div style={{
      background: '#020617',
      color: '#38bdf8',
      fontFamily: 'monospace',
      padding: '1.5rem',
      borderRadius: '12px',
      border: '1px solid #1e293b',
      height: '300px',
      overflowY: 'auto',
      fontSize: '0.85rem',
      lineHeight: '1.6',
      marginTop: '1.5rem',
      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
    }}>
      <div style={{ marginBottom: '1rem', color: '#94a3b8', borderBottom: '1px dashed #334155', paddingBottom: '0.5rem' }}>
        &gt;_ ZK-SNARK Edge-Computation Terminal
      </div>
      {logs.map((log, i) => (
        <div key={i} style={{ 
          color: log.includes('[SUCCESS]') ? '#34d399' : log.includes('[DEBUG]') ? '#94a3b8' : '#38bdf8' 
        }}>
          {log}
        </div>
      ))}
      {isProcessing && logs.length < mockLogs.length && (
        <div style={{ animation: 'blink 1s infinite' }}>_</div>
      )}
      <style>{`
        @keyframes blink { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}
