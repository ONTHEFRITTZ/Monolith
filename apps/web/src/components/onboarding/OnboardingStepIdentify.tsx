import { useState } from "react";
import type { OnboardingState } from "./types";
import styles from "./OnboardingFlow.module.css";

interface OnboardingStepIdentifyProps {
  state: OnboardingState;
  onMetaMask: () => Promise<void>;
  onEmailSubmit: (email: string) => Promise<void>;
  onSocial: () => Promise<void>;
  onToggleSocial: (provider: "google" | "apple") => void;
  socialLogins: Array<"google" | "apple">;
  isProcessing: boolean;
}

export function OnboardingStepIdentify({
  state,
  onMetaMask,
  onEmailSubmit,
  onSocial,
  onToggleSocial,
  socialLogins,
  isProcessing,
}: OnboardingStepIdentifyProps) {
  const [email, setEmail] = useState(state.email ?? "");
  const [localError, setLocalError] = useState<string>();

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !email.includes("@")) {
      setLocalError("Enter a valid email to receive a magic link.");
      return;
    }

    setLocalError(undefined);
    await onEmailSubmit(email.trim());
  };

  return (
    <div className={styles.stepPanel}>
      <p className={styles.stepDescription}>
        Choose how you want to initialise your smart account. You can switch methods later inside
        settings.
      </p>

      <div className={styles.actionGroup}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onMetaMask}
          disabled={isProcessing}
        >
          {isProcessing && state.loginType === "metamask" ? "Connecting..." : "Connect MetaMask"}
        </button>
        <p className={styles.helperText}>
          Requires MetaMask Smart Accounts. We&apos;ll fall back to a browser prompt if the
          extension is missing.
        </p>
      </div>

      <form className={styles.emailForm} onSubmit={handleEmailSubmit}>
        <label htmlFor="onboarding-email">Or receive a magic link</label>
        <div className={styles.emailRow}>
          <input
            id="onboarding-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isProcessing}
            required
          />
          <button type="submit" className={styles.secondaryButton} disabled={isProcessing}>
            {isProcessing && state.loginType === "email" ? "Sending..." : "Send Link"}
          </button>
        </div>
        {localError ? <p className={styles.errorInline}>{localError}</p> : null}
      </form>

      <div className={styles.socialBlock}>
        <p>Prefer social login?</p>
        <div className={styles.socialGrid}>
          {(["google", "apple"] as const).map((provider) => {
            const selected = socialLogins.includes(provider);
            return (
              <label key={provider} className={styles.socialOption}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSocial(provider)}
                  disabled={isProcessing}
                />
                <span>{provider === "google" ? "Google" : "Apple"}</span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={onSocial}
          disabled={isProcessing}
        >
          {isProcessing && state.loginType === "social"
            ? "Preparing SSO..."
            : "Continue with selected providers"}
        </button>
      </div>

      <ul className={styles.noteList}>
        <li>We create a temporary AA session and only store encrypted secrets on success.</li>
        <li>Resuming later? Use the same email or wallet to pick up where you left off.</li>
      </ul>
    </div>
  );
}
