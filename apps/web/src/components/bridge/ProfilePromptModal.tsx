import { useRouter } from "next/navigation";
import styles from "./BridgeFlow.module.css";

interface ProfilePromptModalProps {
  open: boolean;
  onDismiss: () => void;
  onContinueGuest: () => void;
}

export function ProfilePromptModal({ open, onDismiss, onContinueGuest }: ProfilePromptModalProps) {
  const router = useRouter();

  if (!open) {
    return null;
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Create your bridge profile</h2>
            <p className={styles.modalSubtitle}>
              Signing in unlocks sponsorship tracking, usage analytics, and priority recovery when
              intents stall. Prefer to stay anonymous? Continue as a guest and we will simply apply
              the standard routing fee.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onDismiss}>
            Close
          </button>
        </div>

        <div className={styles.profileModalActions}>
          <button
            type="button"
            className={styles.profilePrimary}
            onClick={() => {
              onDismiss();
              router.push("/onboarding");
            }}
          >
            Sign in &amp; claim sponsorship
          </button>
          <button
            type="button"
            className={styles.profileSecondary}
            onClick={() => {
              onContinueGuest();
            }}
          >
            Continue without sponsorship (higher fee)
          </button>
        </div>
        <p className={styles.profileCopy}>
          We may collect flow telemetry in aggregate to keep the free tier sustainable. No personal
          data is sold; shared insights are anonymised and limited to liquidity and volume metrics.
          Read the <span className={styles.profileAccent}>usage policy</span> to learn how we
          protect wallet privacy.
        </p>
      </div>
    </div>
  );
}
