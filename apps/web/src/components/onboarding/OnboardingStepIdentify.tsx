import type { WalletProvider } from "../bridge/types";
import type { OnboardingState } from "./types";
import styles from "./OnboardingFlow.module.css";

interface OnboardingStepIdentifyProps {
  state: OnboardingState;
  onWalletConnect: (provider: WalletProvider) => Promise<void>;
  onSocialConnect: (provider: "google" | "apple") => Promise<void>;
  isProcessing: boolean;
}

export function OnboardingStepIdentify({
  state,
  onWalletConnect,
  onSocialConnect,
  isProcessing,
}: OnboardingStepIdentifyProps) {
  const walletOptions: Array<{
    provider: WalletProvider;
    label: string;
    description: string;
    icon: string;
    enabled: boolean;
  }> = [
    {
      provider: "metamask",
      label: "MetaMask",
      description: "Link your EVM wallet and continue with gas sponsorship.",
      icon: "/logos/metamask.png",
      enabled: true,
    },
    {
      provider: "phantom",
      label: "Phantom",
      description: "Solana support is on the way.",
      icon: "/logos/phantom.png",
      enabled: false,
    },
    {
      provider: "backpack",
      label: "Backpack",
      description: "Seamless MON + Solana experience soon.",
      icon: "/logos/backpack.png",
      enabled: false,
    },
  ];

  return (
    <div className={styles.stepPanel}>
      <p className={styles.stepDescription}>
        Choose which connections you want to link to your Monolith smart account. You can add or
        remove additional wallets later inside settings.
      </p>

      <div className={styles.walletLinkSection}>
        <div className={styles.walletLinkOptions}>
          {walletOptions.map((option) => (
            <button
              key={option.provider}
              type="button"
              className={styles.walletLinkButton}
              onClick={() => onWalletConnect(option.provider)}
              disabled={!option.enabled || isProcessing}
            >
              <span className={styles.walletLinkIcon}>
                <img src={option.icon} alt={`${option.label} logo`} />
              </span>
              <span className={styles.walletLinkLabel}>{option.label}</span>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.socialBlock}>
        <p>Prefer social connections?</p>
        <div className={styles.socialActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onSocialConnect("google")}
            disabled={isProcessing}
          >
            {isProcessing && state.loginType === "social" ? "Linking..." : "Link Google"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onSocialConnect("apple")}
            disabled={isProcessing}
          >
            {isProcessing && state.loginType === "social" ? "Linking..." : "Link Apple"}
          </button>
        </div>
      </div>

      <ul className={styles.noteList}>
        <li>
          We create a temporary smart-account session and only store encrypted secrets on success.
        </li>
        <li>
          Resuming later? Use the same wallet or social account to pick up where you left off.
        </li>
      </ul>
    </div>
  );
}
