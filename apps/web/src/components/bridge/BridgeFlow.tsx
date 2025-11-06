"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./BridgeFlow.module.css";
import { useBridgeState } from "./useBridgeState";
import { BalanceIntentList } from "./BalanceIntentList";
import { AmountSheet } from "./AmountSheet";
import { BridgeStatusBar } from "./BridgeStatusBar";
import type { BalanceIntent, WalletProvider, WalletConnection } from "./types";
import { providerLabel } from "./bridgeClient";
import { PlansPricingModal } from "./PlansPricingModal";
import { ProfilePromptModal } from "./ProfilePromptModal";
import { ProfileSettingsModal } from "./ProfileSettingsModal";
import type { LinkedWallet } from "../onboarding/types";
import type { StoredProfile } from "@/lib/profile";
import {
  consumeAutoConnectProviders,
  providersFromProfile,
  markProfileAcknowledged,
  isProfileAcknowledged,
  readProfile,
  writeProfile,
  clearProfileStorage,
  syncProfileWithServer,
  updateProfilePlan,
  updateProfileSettings,
  type ProfileSettingsPatch,
} from "@/lib/profile";

const WALLET_OPTIONS: WalletProvider[] = ["metamask", "phantom", "backpack"];
const PROVIDER_DISPLAY_ORDER: WalletProvider[] = ["metamask", "phantom", "backpack"];
const WALLET_LOGOS: Record<WalletProvider, string> = {
  metamask: "/logos/metamask.png",
  phantom: "/logos/phantom.png",
  backpack: "/logos/backpack.png",
};
export function BridgeFlow() {
  const { state, actions } = useBridgeState();
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [guestMode, setGuestMode] = useState(true);
  const [autoConnectProviders, setAutoConnectProviders] = useState<WalletProvider[] | null>(null);
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [profilePromptInitialized, setProfilePromptInitialized] = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [planUpdating, setPlanUpdating] = useState(false);
  const [settingsUpdating, setSettingsUpdating] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const handleGuestContinue = useCallback(() => {
    clearProfileStorage();
    markProfileAcknowledged();
    setGuestMode(true);
    setProfile(null);
    setProfileOpen(false);
  }, []);

  const handleProfileMutation = useCallback(
    (mutator: (current: StoredProfile) => StoredProfile) => {
      setGuestMode(false);
      setProfile((prev) => {
        if (!prev) {
          return prev;
        }
        const next = mutator(prev);
        writeProfile(next);
        return next;
      });
    },
    []
  );

  const handleLinkWalletFromSettings = useCallback(
    async (provider: WalletProvider) => {
      await actions.connectProvider(provider);
    },
    [actions]
  );

  const handleRemoveWalletFromSettings = useCallback(
    async (provider: WalletProvider) => {
      await actions.removeProvider(provider);
    },
    [actions]
  );

  const handleSlippageChange = useCallback(
    (value: number) => {
      const clamped = Math.min(5, Math.max(0, value));
      setSlippage(Number(clamped.toFixed(2)));
      actions.resetSubmission();
    },
    [actions]
  );

  const handleSignOut = useCallback(async () => {
    await actions.disconnectAll();
    clearProfileStorage();
    setProfile(null);
    setGuestMode(true);
    setProfileSettingsOpen(false);
    setProfilePromptInitialized(false);
    setProfileOpen(true);
    setSettingsUpdating(false);
  }, [actions]);

  useEffect(() => {
    if (profilePromptInitialized) {
      const queued = consumeAutoConnectProviders();
      if (queued.length > 0) {
        setAutoConnectProviders((prev) => mergeProviderLists(prev, queued));
      }
      return;
    }

    const storedProfile = readProfile();
    if (storedProfile) {
      setProfile(storedProfile);
      setGuestMode(false);
      setProfileOpen(false);
      markProfileAcknowledged();
      const providers = providersFromProfile(storedProfile);
      if (providers.length > 0) {
        setAutoConnectProviders((prev) => mergeProviderLists(prev, providers));
      }
    } else {
      setProfileOpen(!isProfileAcknowledged());
    }

    setProfilePromptInitialized(true);
    const queued = consumeAutoConnectProviders();
    if (queued.length > 0) {
      setAutoConnectProviders((prev) => mergeProviderLists(prev, queued));
    }
  }, [profilePromptInitialized]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const synced = await syncProfileWithServer();
      if (!cancelled && synced) {
        setProfile(synced);
        setGuestMode(false);
        const providers = providersFromProfile(synced);
        if (providers.length > 0) {
          setAutoConnectProviders((prev) => mergeProviderLists(prev, providers));
        }
      }
    };

    if (profilePromptInitialized) {
      void run();
    }

    return () => {
      cancelled = true;
    };
  }, [profilePromptInitialized]);

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

  useEffect(() => {
    if (!profile) {
      return;
    }
    const linkedFromState = mapConnectionsToLinkedWallets(state.connectedWallets);
    if (!areLinkedWalletsEqual(profile.linkedWallets, linkedFromState)) {
      const nextProfile: StoredProfile = {
        ...profile,
        linkedWallets: linkedFromState,
      };
      setProfile(nextProfile);
      writeProfile(nextProfile);
    }
  }, [profile, state.connectedWallets]);

  useEffect(() => {
    if (profile) {
      setGuestMode(false);
    }
  }, [profile]);

  const handleSelect = (intent: BalanceIntent) => {
    actions.selectIntent(intent);
    setAmountInput("");
    setSlippage(0.5);
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
    const slippageBps = Math.round(slippage * 100);
    void actions.requestQuote(state.selectedIntent.id, amount, slippageBps);
  };

  const handleConfirm = async () => {
    if (!state.selectedIntent || !state.quote) return;
    const amount = Number(amountInput);
    if (Number.isNaN(amount) || amount <= 0) {
      return;
    }
    const slippageBps = Math.round(slippage * 100);
    await actions.submitBridge(state.selectedIntent.id, amount, slippageBps);
  };

  const handleUpgradePlan = useCallback(async () => {
    if (!profile?.sessionId) {
      setPricingOpen(true);
      return;
    }
    setPlanUpdating(true);
    setProfileError(null);
    try {
      const updated = await updateProfilePlan(profile.sessionId, "pro");
      if (updated) {
        setProfile(updated);
        writeProfile(updated);
        setGuestMode(false);
        setProfileSettingsOpen(false);
        setPricingOpen(true);
      } else {
        setProfileError("Unable to upgrade plan right now. Please retry later.");
      }
    } catch (error) {
      console.error(error);
      setProfileError("Plan upgrade failed. Please retry.");
    } finally {
      setPlanUpdating(false);
    }
  }, [profile, setPricingOpen]);

  const handleProfileSettingsSave = useCallback(
    async (patch: ProfileSettingsPatch) => {
      if (!profile?.sessionId) {
        setProfileError("Profile unavailable. Complete onboarding to manage settings.");
        return;
      }
      setSettingsUpdating(true);
      setProfileError(null);
      try {
        const updated = await updateProfileSettings(profile.sessionId, patch);
        if (updated) {
          setProfile(updated);
          writeProfile(updated);
          setGuestMode(false);
        } else {
          setProfileError("Unable to update profile settings right now. Please retry later.");
        }
      } catch (error) {
        console.error(error);
        setProfileError("Failed to update profile settings. Please retry.");
      } finally {
        setSettingsUpdating(false);
      }
    },
    [profile]
  );

  const handleDismissStatus = () => {
    actions.resetSubmission();
    actions.clearError();
    setSheetOpen(false);
    actions.selectIntent(undefined);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    setSlippage(0.5);
    actions.selectIntent(undefined);
  };

  const connectedSummary =
    !state.isConnected || state.connectedWallets.length === 0
      ? "Connect MetaMask, Phantom, or Backpack to detect balances across your networks."
      : guestMode
        ? "Guest bridging active \u2014 standard routing fee applies. Upgrade to claim sponsorship."
        : "Select a balance below to bridge into Monad.";

  const orderedConnections = useMemo(
    () =>
      PROVIDER_DISPLAY_ORDER.map((provider) =>
        state.connectedWallets.find((wallet) => wallet.provider === provider)
      ).filter((wallet): wallet is WalletConnection => Boolean(wallet)),
    [state.connectedWallets]
  );
  const connectedCount = orderedConnections.length;
  const availableProviders = useMemo(
    () =>
      WALLET_OPTIONS.filter(
        (provider) => !state.connectedWallets.some((wallet) => wallet.provider === provider)
      ),
    [state.connectedWallets]
  );

  const handleProviderConnect = async (provider: WalletProvider) => {
    await actions.connectProvider(provider);
  };

  const renderWalletButtons = () => {
    if (state.connectedWallets.length > 0) {
      return null;
    }
    if (availableProviders.length === 0) {
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

  return (
    <div className={styles.wrapper}>
      <div className={styles.utilityRail}>
        <button type="button" className={styles.planButton} onClick={() => setPricingOpen(true)}>
          Plans &amp; pricing
        </button>

        {guestMode ? (
          <button
            type="button"
            className={styles.signInButton}
            onClick={() => router.push("/onboarding")}
          >
            Sign in
          </button>
        ) : null}

        {!guestMode && profile ? (
          <button
            type="button"
            className={`${styles.profileButton} ${styles.profileButtonMobile}`}
            onClick={() => setProfileSettingsOpen(true)}
          >
            Profile
          </button>
        ) : null}

        {connectedCount > 0 ? (
          <div className={styles.connectedPillFixed}>
            <div className={styles.connectedPillRow}>
              <span className={styles.connectedHeading}>
                {connectedCount} wallet{connectedCount > 1 ? "s" : ""} connected
              </span>
              <div className={styles.connectedActions}>
                {guestMode ? (
                  <>
                    <button
                      type="button"
                      className={`${styles.pillButton} ${styles.pillButtonSecondary}`}
                      onClick={() => router.push("/onboarding")}
                      disabled={state.isLoading}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      className={`${styles.pillButton} ${styles.pillButtonPrimary}`}
                      onClick={() => void actions.disconnectAll()}
                      disabled={state.isLoading}
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`${styles.pillButton} ${styles.pillButtonSecondary}`}
                      onClick={() => setProfileSettingsOpen(true)}
                      disabled={state.isLoading}
                    >
                      Profile
                    </button>
                    <button
                      type="button"
                      className={`${styles.pillButton} ${styles.pillButtonPrimary}`}
                      onClick={() => void actions.disconnectAll()}
                      disabled={state.isLoading}
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>
            <ul className={styles.connectedWalletList}>
              {orderedConnections.map((wallet) => (
                <li
                  key={`${wallet.provider}:${wallet.address}`}
                  className={styles.connectedWalletItem}
                >
                  <span className={styles.connectedWalletIcon}>
                    <Image
                      src={WALLET_LOGOS[wallet.provider]}
                      alt={`${providerLabel(wallet.provider)} logo`}
                      width={20}
                      height={20}
                    />
                  </span>
                  <div className={styles.connectedWalletText}>
                    <span className={styles.connectedWalletProvider}>
                      {providerLabel(wallet.provider)}
                    </span>
                    <span className={styles.connectedWalletAddress}>
                      {shortAddress(wallet.address)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
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

      {state.error || profileError ? (
        <div className={styles.errorBanner}>
          {state.error ?? profileError}
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => {
              actions.clearError();
              setProfileError(null);
            }}
          >
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
        slippage={slippage}
        onSlippageChange={handleSlippageChange}
      />

      <PlansPricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
      <ProfilePromptModal
        open={profileOpen}
        onDismiss={() => setProfileOpen(false)}
        onContinueGuest={handleGuestContinue}
      />

      <ProfileSettingsModal
        open={profileSettingsOpen}
        profile={profile}
        onClose={() => setProfileSettingsOpen(false)}
        onLinkWallet={handleLinkWalletFromSettings}
        onRemoveWallet={handleRemoveWalletFromSettings}
        onMutateProfile={handleProfileMutation}
        onSaveProfileSettings={handleProfileSettingsSave}
        onSignOut={handleSignOut}
        onUpgradePlan={handleUpgradePlan}
        availableProviders={availableProviders}
        walletLogos={WALLET_LOGOS}
        isBusy={state.isLoading || planUpdating || settingsUpdating}
      />
    </div>
  );
}

function shortAddress(address: string) {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function mergeProviderLists(
  current: WalletProvider[] | null,
  incoming: WalletProvider[]
): WalletProvider[] {
  const set = new Set<WalletProvider>(current ?? []);
  incoming.forEach((provider) => set.add(provider));
  return Array.from(set);
}

function mapConnectionsToLinkedWallets(connections: WalletConnection[]): LinkedWallet[] {
  return connections.map((wallet) => ({
    provider: wallet.provider,
    address: wallet.address,
    chains: wallet.chains,
  }));
}

function areLinkedWalletsEqual(a: LinkedWallet[], b: LinkedWallet[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const normalize = (list: LinkedWallet[]) =>
    [...list].sort((x, y) => x.provider.localeCompare(y.provider));
  const sortedA = normalize(a);
  const sortedB = normalize(b);
  return sortedA.every((item, index) => {
    const other = sortedB[index];
    return (
      item.provider === other.provider && item.address.toLowerCase() === other.address.toLowerCase()
    );
  });
}
