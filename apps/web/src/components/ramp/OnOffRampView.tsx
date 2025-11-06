import Link from "next/link";
import styles from "./OnOffRamp.module.css";

export function OnOffRampView() {
  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <h1 className={styles.title}>USDC On / Off Ramp</h1>
        <p className={styles.subtitle}>
          Institutional-grade fiat access powered by Circle Mint 4 and (soon) CCTP v2 on Monad.
          Request early access to wire funds directly into Mon-olith intents, or schedule off-ramp
          payouts when you exit liquidity.
        </p>
      </header>

      <section className={styles.grid}>
        <article className={styles.card}>
          <h3>On-Ramp (Fiat → USDC)</h3>
          <p>
            Generate dedicated account numbers and wiring instructions through Circle Mint 4, then
            mint USDC that flows into your bridge balances. Settlement windows currently operate on
            T+0 for US-based wires.
          </p>
          <div className={styles.badgeRow}>
            <span className={styles.badge}>Mint 4 custody</span>
            <span className={styles.badge}>Ledger segregation</span>
            <span className={styles.badge}>KYB required</span>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} disabled>
              Request deposit instructions
            </button>
            <button type="button" className={styles.secondaryButton}>
              View requirements
            </button>
          </div>
        </article>

        <article className={styles.card}>
          <h3>Off-Ramp (USDC → Fiat)</h3>
          <p>
            Schedule payouts to treasury accounts once bridge exits settle. We support batch
            settlement, compliance attestations, and optional AML screening for counterparties.
          </p>
          <div className={styles.badgeRow}>
            <span className={styles.badge}>ACH / Fedwire</span>
            <span className={styles.badge}>Realtime tracking</span>
            <span className={styles.badge}>Policy based limits</span>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} disabled>
              Schedule payout
            </button>
            <button type="button" className={styles.secondaryButton}>
              Export policy template
            </button>
          </div>
        </article>
      </section>

      <section className={styles.card}>
        <h3>Activation Timeline</h3>
        <div className={styles.timeline}>
          <div className={styles.timelineItem}>
            <strong>Phase 1 · Live today</strong>
            <span>Mint 4 account onboarding, manual wire instructions, compliance pre-checks.</span>
          </div>
          <div className={styles.timelineItem}>
            <strong>Phase 2 · Circle CCTP v2</strong>
            <span>
              Automatic USDC mint/burn on Monad once Circle deploys TokenMessenger + contracts.
            </span>
          </div>
          <div className={styles.timelineItem}>
            <strong>Phase 3 · Automated payouts</strong>
            <span>
              Self-serve scheduling, webhook notifications, and configurable treasury policies.
            </span>
          </div>
        </div>
      </section>

      <p className={styles.note}>
        Need help?{" "}
        <Link href="mailto:support@mon-olith.xyz" className={styles.secondaryButton}>
          Contact our treasury desk
        </Link>
      </p>
    </div>
  );
}
