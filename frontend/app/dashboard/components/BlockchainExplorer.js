"use client";
import styles from '../dashboard.module.css';

export default function BlockchainExplorer({ events = [] }) {
  // If no real events, show a placeholder
  const displayEvents = events.length > 0 ? events : [
    { type: "Contract Deployed", hash: "0x5FbDB2315678afecb367f032d93F642f64180aa3", timestamp: "System Init", farmer: "0x0000000000000000000000000000000000000000" },
    { type: "Oracle Trigger", hash: "0xchainlink_event_b8f4...", timestamp: "Live", farmer: "0xChainlinkOracle0000000000000000000000000" }
  ];

  return (
    <div style={{ marginTop: '2rem' }}>
      <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#f8fafc' }}>
        Live Network Feed
      </h3>
      <div className={styles.explorerContainer}>
        {displayEvents.map((evt, idx) => (
          <div key={idx} className={styles.explorerCard}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span className={`${styles.explorerBadge} ${evt.type === 'PolicyCommitted' ? styles.badgeInfo : styles.badgeSuccess}`}>
                {evt.type}
              </span>
              <span className={styles.explorerTime}>{evt.timestamp}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#e2e8f0', fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                Actor: <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{evt.farmer ? `${evt.farmer.substring(0,6)}...${evt.farmer.substring(evt.farmer.length - 4)}` : 'System'}</span>
              </div>
              <div style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>
                {evt.type.includes('Payout') ? 'Payout: ' : 'Hash: '}
                {evt.type.includes('Payout') ? (
                  <strong style={{ color: '#10b981' }}>{evt.amount} ETH</strong>
                ) : (
                  <span className={styles.explorerHash}>{evt.hash.substring(0,14)}...</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
