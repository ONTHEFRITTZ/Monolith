import type { ChangeEvent } from "react";
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
  slippage: number;
  onSlippageChange: (value: number) => void;
}

const quickPercents = [25, 50, 75, 100];
const slippagePresets = [0.1, 0.5, 1, 2];
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

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
  slippage,
  onSlippageChange,
}: AmountSheetProps) {
  if (!open || !intent) {
    return null;
  }

  const displayLabel = `${intent.sourceToken.toUpperCase()} · ${chainLabel(intent.sourceChain)} → ${intent.destinationToken.toUpperCase()} · ${chainLabel(intent.destinationChain)}`;
  const amountNumber = Number(amountInput) || 0;
  const actionLabel = quote ? `Sign with ${providerLabel(intent.provider)}` : "Preview Bridge";
  const usdPerUnit =
    intent.availableAmount > 0 ? intent.usdValue / intent.availableAmount : undefined;
  const handleSlippageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === "") {
      onSlippageChange(0);
      return;
    }
    const next = Number.parseFloat(raw);
    if (Number.isNaN(next)) {
      return;
    }
    onSlippageChange(next);
  };

  return (
    <div
      className={styles.sheetOverlay}
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!isLoading) {
          onClose();
        }
      }}
    >
      <div
        className={styles.sheetContent}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className={styles.sheetHeader}>
          <div>
            <h2 className={styles.sheetTitle}>Bridge {intent.sourceToken.toUpperCase()}</h2>
            <p className={styles.intentSubtitle}>
              {displayLabel} · {providerLabel(intent.provider)}
            </p>
          </div>
          <button type="button" className={styles.ghostButton} onClick={onClose}>
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
            {quickPercents.map((percent) => {
              const quickAmount = (intent.availableAmount * percent) / 100;
              const quickUsd = usdPerUnit ? usdPerUnit * quickAmount : undefined;
              return (
                <button
                  key={percent}
                  type="button"
                  className={styles.quickButton}
                  onClick={() => onQuickSelect(percent)}
                  disabled={isLoading}
                >
                  <span>{percent}%</span>
                  {quickUsd !== undefined ? <small>{usdFormatter.format(quickUsd)}</small> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.quoteSummary}>
          <div className={styles.summaryRow}>
            <span>Available</span>
            <span>{intent.availableFormatted}</span>
          </div>
          {usdPerUnit ? (
            <div className={styles.summaryRow}>
              <span>Spot price</span>
              <span>
                ~{usdFormatter.format(usdPerUnit)} / {intent.sourceToken.toUpperCase()}
              </span>
            </div>
          ) : null}
          <div className={styles.summaryRow}>
            <span>Fee rate</span>
            <span>{(intent.feeBps / 100).toFixed(2)}%</span>
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

        <div className={styles.slippageBlock}>
          <div className={styles.slippageHeader}>
            <span className={styles.fieldLabel}>Slippage tolerance</span>
            <span className={styles.slippageValue}>{slippage.toFixed(2)}%</span>
          </div>
          <div className={styles.slippageOptions}>
            {slippagePresets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={
                  Math.abs(slippage - preset) < 0.001
                    ? styles.slippageButtonActive
                    : styles.slippageButton
                }
                onClick={() => onSlippageChange(preset)}
                disabled={isLoading}
              >
                {preset.toFixed(1)}%
              </button>
            ))}
            <label className={styles.slippageInputRow}>
              <span>Custom</span>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={slippage}
                onChange={handleSlippageInputChange}
                disabled={isLoading}
              />
              <span className={styles.slippageSuffix}>%</span>
            </label>
          </div>
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
