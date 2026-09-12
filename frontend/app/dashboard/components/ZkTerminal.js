"use client";
import { useState, useEffect } from 'react';

export default function ZkTerminal({ isProcessing, logs = [] }) {
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
      {isProcessing && (
        <div style={{ display: 'inline-block', width: '8px', height: '15px', background: '#4ade80', animation: 'blink 1s step-end infinite', verticalAlign: 'middle', marginLeft: '4px' }}></div>
      )}
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
