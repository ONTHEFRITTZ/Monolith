import styles from "./BridgeFlow.module.css";
import { chainLabel, providerLabel } from "./bridgeClient";
import type { BalanceIntent } from "./types";

interface IntentCardProps {
  intent: BalanceIntent;
  onSelect: (intent: BalanceIntent) => void;
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function IntentCard({ intent, onSelect }: IntentCardProps) {
  const label = `${intent.sourceToken.toUpperCase()} \u00b7 ${chainLabel(intent.sourceChain)} \u2192 ${intent.destinationToken.toUpperCase()} \u00b7 ${chainLabel(intent.destinationChain)}`;
  const feePercent = intent.feeBps / 100;
  const approxUsd = usdFormatter.format(intent.usdValue);
  const unitPrice =
    intent.availableAmount > 0 ? intent.usdValue / intent.availableAmount : undefined;

  return (
    <button type="button" className={styles.intentCard} onClick={() => onSelect(intent)}>
      <div className={styles.intentCardLeft}>
        <p className={styles.intentTitle}>{label}</p>
        <p className={styles.intentSubtitle}>
          Available {intent.availableFormatted} \u00b7 {approxUsd}
          {unitPrice
            ? ` (~${usdFormatter.format(unitPrice)} per ${intent.sourceToken.toUpperCase()})`
            : null}
        </p>
      </div>
      <div className={styles.intentMeta}>
        <span className={styles.intentBalance}>{intent.availableFormatted}</span>
        <div className={styles.intentTags}>
          <span className={styles.tag}>{providerLabel(intent.provider)}</span>
          <span className={styles.tag}>{feePercent.toFixed(2)}% fee</span>
          <span className={`${styles.tag} ${styles.tagNeutral}`}>{intent.etaMinutes} min ETA</span>
          <span className={`${styles.tag} ${styles.tagAccent}`}>{approxUsd}</span>
        </div>
      </div>
    </button>
  );
}
