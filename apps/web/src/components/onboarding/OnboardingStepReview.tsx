import Link from "next/link";
import { providerLabel } from "../bridge/bridgeClient";
import type { OnboardingState } from "./types";
import styles from "./OnboardingFlow.module.css";

interface OnboardingStepReviewProps {
  state: OnboardingState;
  onBack: () => void;
  onSubmit: () => Promise<void>;
  isProcessing: boolean;
}

export function OnboardingStepReview({
  state,
  onBack,
  onSubmit,
  isProcessing,
}: OnboardingStepReviewProps) {
  const estimate = state.sponsorshipEstimates[state.sponsorshipPlan];

  return (
    <div className={styles.stepPanel}>
      <p className={styles.stepDescription}>
        Review your onboarding selections. We&apos;ll provision the smart account, hydrate the
        paymaster, and unlock bridging once complete.
      </p>

      <div className={styles.summarySection}>
        <div>
          <h3>Account</h3>
          <dl>
            <div>
              <dt>Login method</dt>
              <dd>{formatLoginMethod(state.loginType)}</dd>
            </div>
            <div>
              <dt>Owner address</dt>
              <dd className={styles.addressMono}>{state.ownerAddress ?? "Pending"}</dd>
            </div>
            <div>
              <dt>Linked wallets</dt>
              <dd>{formatLinkedWallets(state)}</dd>
            </div>
            <div>
              <dt>Social logins</dt>
              <dd>
                {state.socialLogins.length > 0
                  ? state.socialLogins
                      .map((provider) => (provider === "google" ? "Google" : "Apple"))
                      .join(", ")
                  : "None added"}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3>Recovery</h3>
          <dl>
            <div>
              <dt>Contacts</dt>
              <dd>
                {state.contacts.length > 0
                  ? state.contacts.map((contact) => contact.value).join(", ")
                  : "Not set"}
              </dd>
            </div>
            <div>
              <dt>Threshold</dt>
              <dd>
                {state.recoveryThreshold}-of-{Math.max(state.contacts.length, 1)}
              </dd>
            </div>
            <div>
              <dt>Passkey</dt>
              <dd>{state.passkeyEnrolled ? "Enabled" : "Not enabled"}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h3>Sponsorship</h3>
          <dl>
            <div>
              <dt>Plan</dt>
              <dd>{state.sponsorshipPlan}</dd>
            </div>
            <div>
              <dt>Allowance</dt>
              <dd>
                {estimate
                  ? `$${estimate.monthlyAllowance} ${estimate.currency} / month`
                  : "Pending estimate"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <p className={styles.helperText}>
        By creating your smart account you agree to our{" "}
        <Link href="/legal/terms" className={styles.link}>
          Terms of Use
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" className={styles.link}>
          Privacy Policy
        </Link>
        .
      </p>

      <div className={styles.footerActions}>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={onBack}
          disabled={isProcessing}
        >
          Back
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onSubmit}
          disabled={isProcessing}
        >
          {isProcessing ? "Provisioning..." : "Create Smart Account"}
        </button>
      </div>
    </div>
  );
}

function formatLoginMethod(loginType?: OnboardingState["loginType"]): string {
  switch (loginType) {
    case "metamask":
      return "MetaMask smart account";
    case "email":
      return "Magic link";
    case "social":
      return "Google / Apple SSO";
    default:
      return "Not set";
  }
}

function formatLinkedWallets(state: OnboardingState): string {
  if (state.linkedWallets.length === 0) {
    return "None linked";
  }
  return state.linkedWallets
    .map((wallet) => `${providerLabel(wallet.provider)} · ${shortAddress(wallet.address)}`)
    .join(", ");
}

function shortAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
