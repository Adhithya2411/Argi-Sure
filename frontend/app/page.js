import Link from 'next/link';
import styles from './page.module.css';

export default function LandingPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>Zk-AgriSure</div>
        <nav className={styles.nav}>
          <a href="#features" className={styles.navLink}>Features</a>
          <a href="#architecture" className={styles.navLink}>Architecture</a>
          <Link href="/dashboard" className={styles.navLink}>Launch App</Link>
        </nav>
      </header>

      <main className={styles.hero}>
        <div className={styles.heroGrid}></div>
        <div className={styles.heroContent}>
          <div className={styles.badge}>DECENTRALIZED PARAMETRIC INSURANCE</div>
          <h1 className={styles.title}>Privacy-Preserving Crop Insurance Architecture</h1>
          <p className={styles.subtitle}>
            Bridges DeFi and enterprise compliance by using Zero-Knowledge spatial verification to execute sensitive institutional agreements without compromising underlying GPS intelligence.
          </p>
          
          <div className={styles.actions}>
            <Link href="/dashboard" className={styles.primaryButton}>
              Connect Wallet to Enter App
            </Link>
            <a href="#features" className={styles.secondaryButton}>
              Learn More
            </a>
          </div>
        </div>
      </main>

      <section id="features" className={styles.features}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>🛡️</div>
          <h3 className={styles.featureTitle}>Geospatial Privacy</h3>
          <p className={styles.featureText}>
            Pioneers the cryptographic obfuscation of static, physical location data within decentralized finance, rather than just hiding financial transaction amounts.
          </p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>🧮</div>
          <h3 className={styles.featureTitle}>Discrete Scaling</h3>
          <p className={styles.featureText}>
            Overcomes the inability of zero-knowledge circuits to process floating-point GPS coordinates by scaling satellite data by a factor of 10^7.
          </p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>⚡</div>
          <h3 className={styles.featureTitle}>Edge-Computation</h3>
          <p className={styles.featureText}>
            Radically reduces blockchain gas fees by shifting heavy mathematical intersection logic to the local edge device off-chain, strictly utilizing Ethereum for lightweight proof verification.
          </p>
        </div>
      </section>
    </div>
  );
}
