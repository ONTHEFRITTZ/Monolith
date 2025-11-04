"use client";

import { useMemo, useState } from "react";
import styles from "./BridgeFlow.module.css";
import { useBridgeState } from "./useBridgeState";
import { BalanceIntentList } from "./BalanceIntentList";
import { AmountSheet } from "./AmountSheet";
import { BridgeStatusBar } from "./BridgeStatusBar";
import type { BalanceIntent } from "./types";

export function BridgeFlow() {
  const { state, actions } = useBridgeState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");

  const handleSelect = (intent: BalanceIntent) => {
    actions.selectIntent(intent);
    setAmountInput("");
    setSheetOpen(true);
  };

  const handleQuickSelect = (percentage: number) => {
    if (!state.selectedIntent) return;
    const value = (state.selectedIntent.availableAmount * (percentage / 100)).toFixed(4);
    setAmountInput(value);
  };

  const handlePreview = () => {
    if (!state.selectedIntent) return;
    const amount = Number(amountInput);
    if (Number.isNaN(amount) || amount <= 0) {
      return;
    }
    actions.requestQuote(state.selectedIntent.id, amount);
  };

  const handleConfirm = async () => {
    if (!state.selectedIntent || !state.quote) return;
    const amount = Number(amountInput);
    if (Number.isNaN(amount) || amount <= 0) {
      return;
    }
    await actions.submitBridge(state.selectedIntent.id, amount);
  };

  const handleDismissStatus = () => {
    actions.resetSubmission();
    actions.clearError();
    setSheetOpen(false);
    actions.selectIntent(undefined);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    actions.selectIntent(undefined);
  };

  const connectCopy = state.isConnected ? "Refresh balances" : "Connect wallet";
  const connectHandler = state.isConnected ? actions.refreshBalances : actions.connectWallet;

  const primaryAddress = state.primaryAddress ?? "Not connected";

  const headerSubtitle = useMemo(() => {
    if (!state.isConnected) {
      return "Connect your smart account to detect USDC balances across Ethereum, Arbitrum, Solana, and more.";
    }
    return `Connected as ${primaryAddress}. Select a balance to bridge into Monad.`;
  }, [primaryAddress, state.isConnected]);

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <h1 className={styles.headline}>Bridge assets to Monad in seconds</h1>
        <p className={styles.subline}>{headerSubtitle}</p>

        <div className={styles.connectActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={connectHandler}
            disabled={state.isLoading}
          >
            {state.isLoading ? "Loading..." : connectCopy}
          </button>
          {state.isConnected ? (
            <button type="button" className={styles.ghostButton} onClick={actions.disconnect}>
              Disconnect
            </button>
          ) : null}
        </div>
      </header>

      {state.error ? (
        <div className={styles.errorBanner}>
          {state.error}
          <button type="button" className={styles.ghostButton} onClick={actions.clearError}>
            Dismiss
          </button>
        </div>
      ) : null}

      {state.isConnected ? (
        <BalanceIntentList intents={state.intents} onSelect={handleSelect} />
      ) : (
        <p className={styles.subline}>
          We support USDC on Ethereum, Arbitrum, Solana, and more. Connect a wallet to see your
          available balances.
        </p>
      )}

      {state.submission ? (
        <BridgeStatusBar submission={state.submission} onDismiss={handleDismissStatus} />
      ) : null}

      <AmountSheet
        open={sheetOpen}
        intent={state.selectedIntent}
        amountInput={amountInput}
        onAmountChange={setAmountInput}
        onClose={handleCloseSheet}
        onQuickSelect={handleQuickSelect}
        onPreview={handlePreview}
        onConfirm={handleConfirm}
        quote={state.quote}
        isLoading={state.isLoading}
        submission={state.submission}
      />
    </div>
  );
}
