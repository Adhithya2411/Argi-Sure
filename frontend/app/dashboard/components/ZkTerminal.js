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
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      color: '#4ade80',
      fontFamily: '"Fira Code", monospace',
      padding: '1.5rem',
      borderRadius: '16px',
      border: '1px solid rgba(74, 222, 128, 0.2)',
      height: '300px',
      overflowY: 'auto',
      fontSize: '0.9rem',
      lineHeight: '1.6',
      marginTop: '1.5rem',
      boxShadow: '0 10px 30px -10px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.5)'
    }}>
      <div style={{ marginBottom: '1rem', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{width: 10, height: 10, borderRadius: '50%', background: '#ef4444'}}></div>
        <div style={{width: 10, height: 10, borderRadius: '50%', background: '#eab308'}}></div>
        <div style={{width: 10, height: 10, borderRadius: '50%', background: '#22c55e'}}></div>
        <span style={{marginLeft: '0.5rem'}}>&gt;_ ZK-SNARK Edge-Computation Protocol</span>
      </div>
      {logs.map((log, i) => (
        <div key={i} style={{ 
          color: log.includes('[SUCCESS]') ? '#10b981' : log.includes('[DEBUG]') ? '#64748b' : '#4ade80',
          fontWeight: log.includes('[SUCCESS]') ? 'bold' : 'normal'
        }}>
          {log}
        </div>
      ))}
      {isProcessing && logs.length < mockLogs.length && (
        <div style={{ display: 'inline-block', width: '8px', height: '15px', background: '#4ade80', animation: 'blink 1s step-end infinite', verticalAlign: 'middle', marginLeft: '4px' }}></div>
      )}
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
