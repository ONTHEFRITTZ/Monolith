import Link from "next/link";
import styles from "./page.module.css";

const featureHighlights = [
  {
    title: "Smart Accounts by Default",
    description:
      "MetaMask + Alchemy Smart Wallet SDK with social recovery, session keys, and gas sponsorship baked in.",
  },
  {
    title: "Transparent Liquidity Routing",
    description:
      "Best execution across native pools, partner LPs, and intent batching for consistently low spread.",
  },
  {
    title: "Compliance Ready Controls",
    description:
      "Configurable limits, KYB/KYC hooks, and verifiable audit logging for enterprise-grade assurance.",
  },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.badge}>Building on Monad</p>
          <h1>
            Mon-olith bridges USDC &lt;-&gt; MON with low fees and intuitive smart-account UX.
          </h1>
          <p className={styles.subtitle}>
            A unified interface for retail, merchants, and institutional teams to move value across
            Monad with confidence. Launching soon with quick off-ramps and partner APIs.
          </p>
          <div className={styles.ctas}>
            <Link className={styles.primary} href="/onboarding">
              Get Started
            </Link>
            <Link className={styles.secondary} href="#updates">
              View Build Roadmap
            </Link>
            <Link
              className={styles.secondary}
              href="https://alchemy.com/smart-wallet"
              target="_blank"
            >
              Explore AA Stack
            </Link>
          </div>
        </section>

        <section className={styles.features}>
          {featureHighlights.map((feature) => (
            <div key={feature.title} className={styles.featureCard}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </section>

        <section id="updates" className={styles.timeline}>
          <h2>Launch Track</h2>
          <ul>
            <li>
              <span className={styles.phase}>Phase 0 - Foundations</span>
              Turborepo monorepo, AA onboarding flow scaffolding, and Monad bridge contract specs.
            </li>
            <li>
              <span className={styles.phase}>Phase 1 - Alpha Bridge</span>
              Testnet settlement path with gas-sponsored smart accounts and live status
              notifications.
            </li>
            <li>
              <span className={styles.phase}>Phase 2 - Beta + Off-Ramp</span>
              PayPal agent integration, merchant SDK preview, and enhanced compliance controls.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
