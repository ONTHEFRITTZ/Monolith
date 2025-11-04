import Link from "next/link";
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
              <dd>{state.loginType ?? "—"}</dd>
            </div>
            <div>
              <dt>Owner address</dt>
              <dd className={styles.addressMono}>{state.ownerAddress ?? "pending"}</dd>
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
