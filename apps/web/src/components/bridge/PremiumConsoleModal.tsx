import styles from "./BridgeFlow.module.css";
import type { StoredProfile } from "@/lib/profile";
import type { ProfileSettingsPatch } from "@/lib/profile";

interface PremiumConsoleModalProps {
  open: boolean;
  profile: StoredProfile | null;
  onClose: () => void;
  onSave: (patch: ProfileSettingsPatch) => void;
  isBusy?: boolean;
}

const preferenceKeys: Array<{
  key: keyof NonNullable<StoredProfile["preferences"]>;
  title: string;
  description: string;
}> = [
  {
    key: "analyticsApi",
    title: "Bridge API keys",
    description: "Enable authenticated API access for automated quoting and submission.",
  },
  {
    key: "complianceAlerts",
    title: "Compliance alerts",
    description: "Receive email/webhook alerts when intents trigger policy thresholds.",
  },
  {
    key: "marketplaceAccess",
    title: "Routing marketplace",
    description: "Opt into external liquidity providers that share routing revenue.",
  },
  {
    key: "insightsOptIn",
    title: "Insights & fee rebates",
    description: "Share anonymised telemetry to unlock fee rebates when available.",
  },
];

export function PremiumConsoleModal({
  open,
  profile,
  onClose,
  onSave,
  isBusy = false,
}: PremiumConsoleModalProps) {
  if (!open) {
    return null;
  }

  const preferences = profile?.preferences ?? {};

  const togglePreference = (key: keyof typeof preferences) => {
    const current = preferences[key] ?? false;
    onSave({
      preferences: {
        ...preferences,
        [key]: !current,
      },
    });
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={`${styles.modalPanel} ${styles.premiumPanel}`}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Premium control console</h2>
            <p className={styles.modalSubtitle}>
              Configure automation, compliance, and routing features available to Pro users. Most
              toggles sync with backend policies once the corresponding services go live.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>

        {profile ? (
          <>
            <section className={styles.premiumSection}>
              <h3>Automation & APIs</h3>
              <p>
                Generate API keys and webhook endpoints to automate quoting, submissions, and payout
                tracking. Mint 4 account linking arrives alongside the on/off ramp launch.
              </p>
              <div className={styles.premiumActions}>
                <button type="button" className={styles.primaryButton} disabled>
                  Generate API key
                </button>
                <button type="button" className={styles.secondaryButton} disabled>
                  Manage webhooks
                </button>
              </div>
            </section>

            <section className={styles.premiumSection}>
              <h3>Policy toggles</h3>
              <div className={styles.preferenceGrid}>
                {preferenceKeys.map((pref) => (
                  <button
                    key={pref.key}
                    type="button"
                    className={
                      preferences[pref.key]
                        ? styles.preferenceButtonActive
                        : styles.preferenceButton
                    }
                    onClick={() => togglePreference(pref.key)}
                    disabled={isBusy}
                  >
                    <strong>{pref.title}</strong>
                    <small>{pref.description}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.premiumSection}>
              <h3>Upcoming modules</h3>
              <ul className={styles.featureList}>
                <li>Circle Mint 4 settlement dashboard with realtime wire tracking.</li>
                <li>AMM & lending vault allocations with programmable thresholds.</li>
                <li>NFT-collateral credit lines with oracle-based risk engine.</li>
              </ul>
            </section>
          </>
        ) : (
          <p className={styles.modalSubtitle}>
            Sign in or complete onboarding to unlock premium controls and sponsorship tiers.
          </p>
        )}
      </div>
    </div>
  );
}
