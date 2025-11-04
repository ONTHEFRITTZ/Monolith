import styles from "./BridgeFlow.module.css";
import type { BalanceIntent } from "./types";
import { IntentCard } from "./IntentCard";

interface BalanceIntentListProps {
  intents: BalanceIntent[];
  onSelect: (intent: BalanceIntent) => void;
}

export function BalanceIntentList({ intents, onSelect }: BalanceIntentListProps) {
  if (intents.length === 0) {
    return (
      <p className={styles.subline}>
        No eligible balances detected. Try refreshing or adding funds.
      </p>
    );
  }

  return (
    <div className={styles.intentList}>
      {intents.map((intent) => (
        <IntentCard key={intent.id} intent={intent} onSelect={onSelect} />
      ))}
    </div>
  );
}
