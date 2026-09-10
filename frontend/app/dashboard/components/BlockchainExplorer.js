"use client";
import styles from '../dashboard.module.css';

export default function BlockchainExplorer({ events = [] }) {
  // If no real events, show a placeholder
  const displayEvents = events.length > 0 ? events : [
    { type: "Contract Deployed", hash: "0x5FbDB2315678afecb367f032d93F642f64180aa3", time: "System Init" },
    { type: "Oracle Trigger", hash: "0xchainlink_event_b8f4...", time: "Live" }
  ];

  return (
    <div className={styles.glassCard} style={{ marginTop: '2rem' }}>
      <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', color: '#818cf8' }}>
        Network Explorer (On-Chain Truth)
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>Event Type</th>
            <th style={{ padding: '0.5rem' }}>Cryptographic Target / Tx Hash</th>
            <th style={{ padding: '0.5rem' }}>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {displayEvents.map((evt, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '0.75rem', color: '#f8fafc' }}>
                <span style={{ 
                  background: evt.type.includes('Payout') ? 'rgba(52,211,153,0.2)' : 'rgba(56,189,248,0.2)',
                  color: evt.type.includes('Payout') ? '#34d399' : '#38bdf8',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontWeight: 'bold'
                }}>
                  {evt.type}
                </span>
              </td>
              <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>{evt.hash}</td>
              <td style={{ padding: '0.75rem', color: '#94a3b8' }}>{evt.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
