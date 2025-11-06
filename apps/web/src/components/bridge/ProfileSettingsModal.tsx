import Image from "next/image";
import styles from "./BridgeFlow.module.css";
import type { WalletProvider } from "./types";
import { providerLabel } from "./bridgeClient";
import type {
  SocialProvider,
  StoredProfile,
  ProfilePreferences,
  ProfileSettingsPatch,
} from "@/lib/profile";
import type { LinkedWallet } from "../onboarding/types";

interface PreferenceToggle {
  key: keyof ProfilePreferences;
  title: string;
  description: string;
}

const SOCIAL_PROVIDERS: Array<{ id: SocialProvider; label: string }> = [
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
];

const PLAN_METADATA: Record<
  NonNullable<StoredProfile["sponsorshipPlan"]>,
  {
    label: string;
    allowance: string;
    blurb: string;
    highlight?: string;
    preferenceToggles: PreferenceToggle[];
  }
> = {
  starter: {
    label: "Starter (Sponsored)",
    allowance: "$50 monthly sponsorship",
    blurb: "We cover modest retail flow while you evaluate the bridge.",
    highlight: "Upgrade once you consistently exceed the sponsored quota.",
    preferenceToggles: [
      {
        key: "insightsOptIn",
        title: "Enable fee rebates",
        description:
          "Share anonymised flow metrics so we can rebate part of the routing fee on high-volume weeks.",
      },
    ],
  },
  pro: {
    label: "Pro (Sponsored)",
    allowance: "$250 monthly sponsorship",
    blurb: "Priority routing, concierge recovery, and higher throughput caps.",
    highlight: "API keys unlock automated intents and advanced analytics.",
    preferenceToggles: [
      {
        key: "analyticsApi",
        title: "Bridge API access",
        description:
          "Generate authenticated credentials to submit intents programmatically and receive webhooks.",
      },
      {
        key: "complianceAlerts",
        title: "Compliance alerts",
        description: "Receive notifications when intents trigger compliance workflows or delays.",
      },
      {
        key: "marketplaceAccess",
        title: "Routing marketplace",
        description:
          "Opt into partner liquidity routes that share revenue when they fulfil your orders.",
      },
      {
        key: "insightsOptIn",
        title: "Insights & fee rebates",
        description:
          "Share anonymised telemetry to unlock bridge fee rebates on syndicated liquidity campaigns.",
      },
    ],
  },
  self: {
    label: "Self-managed",
    allowance: "Bring-your-own paymaster",
    blurb: "Use your own gas wallet while still leveraging Monolith automation.",
    highlight: "Add optional services as your operations scale.",
    preferenceToggles: [
      {
        key: "marketplaceAccess",
        title: "Routing marketplace",
        description: "Tap into partner liquidity without committing to the sponsored program.",
      },
      {
        key: "complianceAlerts",
        title: "Compliance tooling",
        description:
          "Enable audit-friendly logging plus notifications when intents require manual review.",
      },
    ],
  },
};

interface ProfileSettingsModalProps {
  open: boolean;
  profile: StoredProfile | null;
  onClose: () => void;
  onLinkWallet: (provider: WalletProvider) => Promise<void> | void;
  onRemoveWallet: (provider: WalletProvider) => Promise<void> | void;
  onMutateProfile: (mutator: (current: StoredProfile) => StoredProfile) => void;
  onSaveProfileSettings: (patch: ProfileSettingsPatch) => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
  onUpgradePlan: () => void;
  availableProviders: WalletProvider[];
  walletLogos: Record<WalletProvider, string>;
  isBusy?: boolean;
}

export function ProfileSettingsModal({
  open,
  profile,
  onClose,
  onLinkWallet,
  onRemoveWallet,
  onMutateProfile,
  onSaveProfileSettings,
  onSignOut,
  onUpgradePlan,
  availableProviders,
  walletLogos,
  isBusy = false,
}: ProfileSettingsModalProps) {
  if (!open) {
    return null;
  }

  const currentPlan = profile?.sponsorshipPlan ?? "starter";
  const planMeta = PLAN_METADATA[currentPlan];
  const linkedWallets: LinkedWallet[] = profile?.linkedWallets ?? [];
  const socialLogins = new Set<SocialProvider>(profile?.socialLogins ?? []);
  const preferences: ProfilePreferences = profile?.preferences ?? {};

  const handlePreferenceToggle = (toggle: PreferenceToggle) => {
    if (!profile || isBusy) return;
    const currentPreferences = profile.preferences ?? {};
    const nextValue = !(currentPreferences[toggle.key] ?? false);
    const nextPreferences: ProfilePreferences = {
      ...currentPreferences,
      [toggle.key]: nextValue,
    };
    void onSaveProfileSettings({ preferences: nextPreferences });
  };

  const handleSocialToggle = (provider: SocialProvider) => {
    if (!profile || isBusy) return;
    const existing = new Set<SocialProvider>(profile.socialLogins ?? []);
    if (existing.has(provider)) {
      existing.delete(provider);
    } else {
      existing.add(provider);
    }
    void onSaveProfileSettings({ socialLogins: Array.from(existing) });
  };

  const handleWalletRemoval = async (provider: WalletProvider) => {
    if (!profile) return;
    await onRemoveWallet(provider);
    onMutateProfile((current) => ({
      ...current,
      linkedWallets: current.linkedWallets.filter((wallet) => wallet.provider !== provider),
    }));
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={`${styles.modalPanel} ${styles.profileSettingsPanel}`}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Profile &amp; controls</h2>
            <p className={styles.modalSubtitle}>
              Manage your linked wallets, social sign-ins, and plan services. Settings update
              instantly and persist for future sessions.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>

        {profile ? (
          <div className={styles.profileSettingsGrid}>
            <section className={styles.profileSettingsSection}>
              <div>
                <h3 className={styles.profileSectionTitle}>{planMeta.label}</h3>
                <p className={styles.profileSectionSubtitle}>{planMeta.blurb}</p>
              </div>

              <div className={styles.profileFieldRow}>
                <span className={styles.profileLabel}>Allowance</span>
                <span className={styles.profileValue}>{planMeta.allowance}</span>
              </div>

              {profile.paymasterPolicyId ? (
                <div className={styles.profileFieldRow}>
                  <span className={styles.profileLabel}>Paymaster policy</span>
                  <span className={styles.profileValue}>{profile.paymasterPolicyId}</span>
                </div>
              ) : null}

              {planMeta.highlight ? (
                <p className={styles.profileSectionSubtitle}>{planMeta.highlight}</p>
              ) : null}

              {currentPlan !== "pro" ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={onUpgradePlan}
                  disabled={isBusy}
                >
                  Upgrade plan
                </button>
              ) : null}

              {planMeta.preferenceToggles.length > 0 ? (
                <div className={styles.profileToggleGroup}>
                  {planMeta.preferenceToggles.map((toggle) => (
                    <label key={toggle.key} className={styles.profileToggleRow}>
                      <input
                        type="checkbox"
                        checked={Boolean(preferences[toggle.key])}
                        onChange={() => handlePreferenceToggle(toggle)}
                        disabled={isBusy}
                      />
                      <span>
                        <strong>{toggle.title}</strong>
                        <small>{toggle.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </section>

            <section className={styles.profileSettingsSection}>
              <div>
                <h3 className={styles.profileSectionTitle}>Linked wallets</h3>
                <p className={styles.profileSectionSubtitle}>
                  Wallets linked here auto-connect on return visits.
                </p>
              </div>

              {linkedWallets.length > 0 ? (
                <ul className={styles.profileWalletList}>
                  {linkedWallets.map((wallet) => (
                    <li key={`${wallet.provider}:${wallet.address}`}>
                      <div className={styles.profileWalletBadge}>
                        <span className={styles.profileWalletIcon}>
                          <Image
                            src={walletLogos[wallet.provider]}
                            alt={`${providerLabel(wallet.provider)} logo`}
                            fill
                            sizes="32px"
                          />
                        </span>
                        <span className={styles.profileWalletAddress}>{wallet.address}</span>
                      </div>
                      <button
                        type="button"
                        className={styles.profileDangerButton}
                        onClick={() => void handleWalletRemoval(wallet.provider)}
                        disabled={isBusy}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.profileWalletPlaceholder}>
                  No wallets linked yet. Add one to enable auto-connect and sponsorship tracking.
                </div>
              )}

              {availableProviders.length > 0 ? (
                <div className={styles.profileWalletActions}>
                  {availableProviders.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => void onLinkWallet(provider)}
                      disabled={isBusy}
                    >
                      Link {providerLabel(provider)}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section className={styles.profileSettingsSection}>
              <div>
                <h3 className={styles.profileSectionTitle}>Social sign-in</h3>
                <p className={styles.profileSectionSubtitle}>
                  Add optional social recovery methods for your smart account session.
                </p>
              </div>

              <div className={styles.profileToggleGroup}>
                {SOCIAL_PROVIDERS.map((provider) => (
                  <label key={provider.id} className={styles.profileToggleRow}>
                    <input
                      type="checkbox"
                      checked={socialLogins.has(provider.id)}
                      onChange={() => handleSocialToggle(provider.id)}
                      disabled={isBusy}
                    />
                    <span>
                      <strong>{provider.label}</strong>
                      <small>
                        {`Allow ${provider.label} to unlock quick sign-in and passwordless recovery.`}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className={styles.profileSettingsEmpty}>
            <p>No profile detected. Complete onboarding to unlock sponsorship controls.</p>
            <button type="button" className={styles.primaryButton} onClick={onUpgradePlan}>
              Start onboarding
            </button>
          </div>
        )}

        <div className={styles.profileSettingsFooter}>
          <div>
            {profile?.smartAccountAddress ? (
              <p className={styles.profileSectionSubtitle}>
                Smart account: {profile.smartAccountAddress}
              </p>
            ) : null}
            {profile?.ownerAddress ? (
              <p className={styles.profileSectionSubtitle}>Owner address: {profile.ownerAddress}</p>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.profileDangerButton}
            onClick={() => void onSignOut()}
            disabled={isBusy}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
