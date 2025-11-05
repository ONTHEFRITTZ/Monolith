import styles from "./BridgeFlow.module.css";
import { chainLabel, providerLabel } from "./bridgeClient";
import type { BalanceIntent } from "./types";

interface IntentCardProps {
  intent: BalanceIntent;
  onSelect: (intent: BalanceIntent) => void;
}

export function IntentCard({ intent, onSelect }: IntentCardProps) {
  const label = `${intent.sourceToken.toUpperCase()} · ${chainLabel(intent.sourceChain)} → ${intent.destinationToken.toUpperCase()} · ${chainLabel(intent.destinationChain)}`;
  const fee = intent.feeBps / 100;

  return (
    <button type="button" className={styles.intentCard} onClick={() => onSelect(intent)}>
      <div className={styles.intentCardLeft}>
        <p className={styles.intentTitle}>{label}</p>
        <p className={styles.intentSubtitle}>
          Available {intent.availableFormatted} · ~${intent.usdValue.toFixed(2)} USD
        </p>
      </div>
      <div className={styles.intentMeta}>
        <span className={styles.intentBalance}>{intent.availableFormatted}</span>
        <div className={styles.intentTags}>
          <span className={styles.tag}>{providerLabel(intent.provider)}</span>
          <span className={styles.tag}>{fee.toFixed(2)} bps fee</span>
          <span className={`${styles.tag} ${styles.tagNeutral}`}>{intent.etaMinutes} min ETA</span>
        </div>
      </div>
    </button>
  );
}
