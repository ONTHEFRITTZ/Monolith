import styles from "./BridgeFlow.module.css";
import type { BridgeSubmission } from "./types";

interface BridgeStatusBarProps {
  submission: BridgeSubmission;
  onDismiss: () => void;
}

const statusCopy: Record<BridgeSubmission["status"], string> = {
  awaiting_source: "Waiting for source transaction confirmation...",
  pending_settlement: "Source confirmed. Settling on Monad.",
  settled: "Bridge settled. Funds available.",
  failed: "Bridge failed. Please retry.",
};

export function BridgeStatusBar({ submission, onDismiss }: BridgeStatusBarProps) {
  return (
    <div className={styles.statusBar}>
      <div className={styles.statusLabel}>{statusCopy[submission.status]}</div>
      <div className={styles.txHash}>{submission.txHash}</div>
      <button type="button" className={styles.ghostButton} onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
