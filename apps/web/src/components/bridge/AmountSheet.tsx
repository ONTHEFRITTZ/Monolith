import styles from "./BridgeFlow.module.css";
import type { BalanceIntent, BridgeSubmission, QuoteResponse } from "./types";
import { chainLabel, providerLabel } from "./bridgeClient";

interface AmountSheetProps {
  open: boolean;
  intent?: BalanceIntent;
  amountInput: string;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onQuickSelect: (percentage: number) => void;
  onPreview: () => void;
  onConfirm: () => void;
  quote?: QuoteResponse;
  isLoading: boolean;
  submission?: BridgeSubmission;
}

const quickPercents = [25, 50, 75, 100];

export function AmountSheet({
  open,
  intent,
  amountInput,
  onAmountChange,
  onClose,
  onQuickSelect,
  onPreview,
  onConfirm,
  quote,
  isLoading,
  submission,
}: AmountSheetProps) {
  if (!open || !intent) {
    return null;
  }

  const displayLabel = `${intent.sourceToken.toUpperCase()} · ${chainLabel(intent.sourceChain)} → ${intent.destinationToken.toUpperCase()} · ${chainLabel(intent.destinationChain)}`;
  const amountNumber = Number(amountInput) || 0;
  const actionLabel = quote ? `Sign with ${providerLabel(intent.provider)}` : "Preview Bridge";

  return (
    <div className={styles.sheetOverlay} role="dialog" aria-modal="true">
      <div className={styles.sheetContent}>
        <div className={styles.sheetHeader}>
          <div>
            <h2 className={styles.sheetTitle}>Bridge {intent.sourceToken.toUpperCase()}</h2>
            <p className={styles.intentSubtitle}>
              {displayLabel} · {providerLabel(intent.provider)}
            </p>
          </div>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={onClose}
            disabled={isLoading}
          >
            Close
          </button>
        </div>

        <div className={styles.amountInputWrapper}>
          <span className={styles.fieldLabel}>Amount</span>
          <div className={styles.amountInput}>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={amountInput}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0.00"
              disabled={isLoading}
            />
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => onAmountChange(intent.availableAmount.toString())}
              disabled={isLoading}
            >
              Max
            </button>
          </div>
          <div className={styles.quickActions}>
            {quickPercents.map((percent) => (
              <button
                key={percent}
                type="button"
                className={styles.quickButton}
                onClick={() => onQuickSelect(percent)}
                disabled={isLoading}
              >
                {percent}%
              </button>
            ))}
          </div>
        </div>

        <div className={styles.quoteSummary}>
          <div className={styles.summaryRow}>
            <span>Available</span>
            <span>{intent.availableFormatted}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>Est. Fee</span>
            <span>{(intent.feeBps / 100).toFixed(2)} bps</span>
          </div>
          {quote ? (
            <>
              <div className={styles.summaryRow}>
                <span>Source</span>
                <span>
                  {quote.sourceAmount.toFixed(4)} {intent.sourceToken.toUpperCase()}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>Destination</span>
                <span>
                  {quote.destinationAmount.toFixed(4)} {intent.destinationToken.toUpperCase()}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>Fee</span>
                <span>
                  {quote.feeAmount.toFixed(4)} {quote.feeCurrency.toUpperCase()}
                </span>
              </div>
            </>
          ) : (
            <div className={styles.summaryRow}>
              <span>Destination</span>
              <span>Enter amount to preview</span>
            </div>
          )}
        </div>

        {!quote ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onPreview}
            disabled={isLoading || amountNumber <= 0}
          >
            {isLoading ? "Loading..." : actionLabel}
          </button>
        ) : (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onConfirm}
            disabled={isLoading || amountNumber <= 0 || submission?.status === "pending_settlement"}
          >
            {isLoading ? "Submitting..." : actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
