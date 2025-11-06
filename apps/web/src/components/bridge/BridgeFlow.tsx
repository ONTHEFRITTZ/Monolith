"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import styles from "./BridgeFlow.module.css";
import { useBridgeState } from "./useBridgeState";
import { BalanceIntentList } from "./BalanceIntentList";
import { AmountSheet } from "./AmountSheet";
import { BridgeStatusBar } from "./BridgeStatusBar";
import type { BalanceIntent, WalletProvider } from "./types";
import { providerLabel } from "./bridgeClient";
import { PlansPricingModal } from "./PlansPricingModal";
import { ProfilePromptModal } from "./ProfilePromptModal";

const WALLET_OPTIONS: WalletProvider[] = ["metamask", "phantom", "backpack"];
const WALLET_LOGOS: Record<WalletProvider, string> = {
  metamask: "/logos/metamask.png",
  phantom: "/logos/phantom.png",
  backpack: "/logos/backpack.png",
};
const AUTO_CONNECT_STORAGE_KEY = "monolith:bridge:autoConnect";

export function BridgeFlow() {
  const { state, actions } = useBridgeState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(true);
  const [guestMode, setGuestMode] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [autoConnectProviders, setAutoConnectProviders] = useState<WalletProvider[] | null>(null);
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(AUTO_CONNECT_STORAGE_KEY);
    if (!raw) {
      return;
    }
    window.localStorage.removeItem(AUTO_CONNECT_STORAGE_KEY);
    try {
      const parsed = JSON.parse(raw) as WalletProvider[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setAutoConnectProviders(parsed);
      }
    } catch (error) {
      console.error("Failed to parse auto-connect providers", error);
    }
  }, []);

  useEffect(() => {
    if (!autoConnectProviders || autoConnectAttempted) {
      return;
    }
    let cancelled = false;

    const run = async () => {
      for (const provider of autoConnectProviders) {
        const alreadyConnected = state.connectedWallets.some(
          (wallet) => wallet.provider === provider
        );
        if (alreadyConnected) {
          continue;
        }
        try {
          await actions.connectProvider(provider);
        } catch (error) {
          console.error(`Auto-connect failed for ${provider}`, error);
        }
      }
    };

    void run().finally(() => {
      if (!cancelled) {
        setAutoConnectAttempted(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [actions, autoConnectAttempted, autoConnectProviders, state.connectedWallets]);

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
    void actions.requestQuote(state.selectedIntent.id, amount);
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

  const connectedSummary =
    !state.isConnected || state.connectedWallets.length === 0
      ? "Connect MetaMask, Phantom, or Backpack to detect balances across your networks."
      : guestMode
        ? "Guest bridging active \u2014 standard routing fee applies. Upgrade to claim sponsorship."
        : "Select a balance below to bridge into Monad.";

  const connectedWallet = state.connectedWallets.length > 0 ? state.connectedWallets[0] : undefined;

  const connectedProviders = useMemo(
    () => new Set(state.connectedWallets.map((wallet) => wallet.provider)),
    [state.connectedWallets]
  );

  const availableProviders = useMemo(
    () => WALLET_OPTIONS.filter((provider) => !connectedProviders.has(provider)),
    [connectedProviders]
  );

  useEffect(() => {
    if (!state.isConnected) {
      setWalletSelectorOpen(false);
    }
  }, [state.isConnected]);

  useEffect(() => {
    if (availableProviders.length === 0 && walletSelectorOpen) {
      setWalletSelectorOpen(false);
    }
  }, [availableProviders.length, walletSelectorOpen]);

  const handleProviderConnect = async (provider: WalletProvider) => {
    try {
      await actions.connectProvider(provider);
    } finally {
      setWalletSelectorOpen(false);
    }
  };

  const renderWalletButtons = () => {
    const shouldShowGrid =
      !state.isConnected || state.connectedWallets.length === 0 || walletSelectorOpen;

    if (!shouldShowGrid || availableProviders.length === 0) {
      return null;
    }

    return (
      <div className={styles.walletGrid}>
        {availableProviders.map((provider) => (
          <button
            key={provider}
            type="button"
            className={styles.walletButton}
            onClick={() => void handleProviderConnect(provider)}
            disabled={state.isLoading}
          >
            <div className={styles.walletImage}>
              <Image
                src={WALLET_LOGOS[provider]}
                alt={`${providerLabel(provider)} logo`}
                fill
                sizes="64px"
              />
            </div>
            <span className={styles.walletButtonLabel}>
              {state.isLoading ? "Connecting..." : providerLabel(provider)}
            </span>
          </button>
        ))}
      </div>
    );
  };

  const hasRemainingProviders = availableProviders.length > 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.utilityRail}>
        <button type="button" className={styles.planButton} onClick={() => setPricingOpen(true)}>
          Plans &amp; pricing
        </button>

        {state.isConnected && connectedWallet ? (
          <div className={styles.connectedPillFixed}>
            <div className={styles.connectedPillMeta}>
              <Image
                src={WALLET_LOGOS[connectedWallet.provider]}
                alt={`${providerLabel(connectedWallet.provider)} logo`}
                width={32}
                height={32}
              />
              <span className={styles.connectedAddress}>
                {shortAddress(connectedWallet.address)}
              </span>
            </div>
            <button
              type="button"
              className={styles.disconnectButton}
              onClick={() => void actions.disconnectAll()}
              disabled={state.isLoading}
            >
              Disconnect
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.brandMark}>
        <Image
          src="/logos/monolith-bridge.png"
          alt="Monolith Bridge"
          width={140}
          height={140}
          priority
        />
      </div>

      <header className={styles.header}>
        <div className={styles.headerTopRow}>
          <h1 className={styles.headline}>BRIDGE</h1>
        </div>
        <p className={styles.subline}>{connectedSummary}</p>

        {renderWalletButtons()}

        {state.isConnected ? (
          <div className={styles.connectActions}>
            {hasRemainingProviders ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setWalletSelectorOpen((prev) => !prev)}
                disabled={state.isLoading}
              >
                {walletSelectorOpen ? "Close wallet list" : "Add wallet"}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void actions.refreshBalances()}
              disabled={state.isLoading}
            >
              {state.isLoading ? "Refreshing..." : "Refresh balances"}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => void actions.disconnectAll()}
              disabled={state.isLoading}
            >
              Disconnect all
            </button>
          </div>
        ) : null}
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
          We surface USDC balances from EVM and Solana wallets. Connect a provider to begin.
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

      <PlansPricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
      <ProfilePromptModal
        open={profileOpen}
        onDismiss={() => setProfileOpen(false)}
        onContinueGuest={() => setGuestMode(true)}
      />
    </div>
  );
}

function shortAddress(address: string) {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
