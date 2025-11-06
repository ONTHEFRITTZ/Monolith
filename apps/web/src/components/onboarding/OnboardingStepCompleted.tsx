import Link from "next/link";
import type { OnboardingState } from "./types";
import styles from "./OnboardingFlow.module.css";

interface OnboardingStepCompletedProps {
  state: OnboardingState;
  onReset: () => void;
}

export function OnboardingStepCompleted({ state, onReset }: OnboardingStepCompletedProps) {
  return (
    <div className={styles.stepPanel}>
      <div className={styles.completionIcon}>{"\u2713"}</div>
      <h2 className={styles.completionTitle}>Smart account ready</h2>
      <p className={styles.stepDescription}>
        Your account is live with the selected paymaster plan. We&apos;ll sync bridge balances and
        notify you when initial funding lands.
      </p>

      <div className={styles.completionDetails}>
        <div>
          <span className={styles.fieldLabel}>Account address</span>
          <span className={styles.addressMono}>
            {state.completedAccountAddress ?? state.ownerAddress ?? "Pending"}
          </span>
        </div>
        <div>
          <span className={styles.fieldLabel}>Paymaster policy</span>
          <span>{state.paymasterPolicyId ?? "Assigned soon"}</span>
        </div>
      </div>

      <div className={styles.footerActions}>
        <button type="button" className={styles.ghostButton} onClick={onReset}>
          Start over
        </button>
        <Link className={styles.primaryButton} href="/">
          Bridge USDC &lt;-&gt; MON
        </Link>
      </div>
    </div>
  );
}
