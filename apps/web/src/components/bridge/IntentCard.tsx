import styles from "./BridgeFlow.module.css";
import { chainLabel, providerLabel } from "./bridgeClient";
import type { BalanceIntent } from "./types";

interface IntentCardProps {
  intent: BalanceIntent;
  onSelect: (intent: BalanceIntent) => void;
}

export function IntentCard({ intent, onSelect }: IntentCardProps) {
  const label = `${intent.sourceToken.toUpperCase()} \u00b7 ${chainLabel(intent.sourceChain)} \u2192 ${intent.destinationToken.toUpperCase()} \u00b7 ${chainLabel(intent.destinationChain)}`;
  const feePercent = intent.feeBps / 100;

  return (
    <button type="button" className={styles.intentCard} onClick={() => onSelect(intent)}>
      <div className={styles.intentCardLeft}>
        <p className={styles.intentTitle}>{label}</p>
        <p className={styles.intentSubtitle}>
          Available {intent.availableFormatted} \u00b7 ~${intent.usdValue.toFixed(2)} USD
        </p>
      </div>
      <div className={styles.intentMeta}>
        <span className={styles.intentBalance}>{intent.availableFormatted}</span>
        <div className={styles.intentTags}>
          <span className={styles.tag}>{providerLabel(intent.provider)}</span>
          <span className={styles.tag}>{feePercent.toFixed(2)}% fee</span>
          <span className={`${styles.tag} ${styles.tagNeutral}`}>{intent.etaMinutes} min ETA</span>
        </div>
      </div>
    </button>
  );
}
