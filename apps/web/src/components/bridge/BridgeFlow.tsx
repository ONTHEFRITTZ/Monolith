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
  readProfile,
  consumeAutoConnectProviders,
  providersFromProfile,
  markProfileAcknowledged,
  isProfileAcknowledged,
  writeProfile,
  clearProfileStorage,
  syncProfileWithServer,
  updateProfilePlan,
  updateProfileSettings,
  type ProfileSettingsPatch,
} from "@/lib/profile";

const WALLET_OPTIONS: WalletProvider[] = ["metamask", "phantom", "backpack"];
const WALLET_LOGOS: Record<WalletProvider, string> = {
  metamask: "/logos/metamask.png",
  phantom: "/logos/phantom.png",
  backpack: "/logos/backpack.png",
};
export function BridgeFlow() {
  const { state, actions } = useBridgeState();
  const router = useRouter();
  const initialProfile = readProfile();
  const [profile, setProfile] = useState<StoredProfile | null>(initialProfile);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [guestMode, setGuestMode] = useState(!initialProfile);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
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

        {guestMode ? (
          <button
            type="button"
            className={styles.signInButton}
            onClick={() => router.push("/onboarding")}
          >
            Sign in
          </button>
        ) : profile ? (
          <button
            type="button"
            className={styles.profileButton}
            onClick={() => setProfileSettingsOpen(true)}
          >
            {profile.sponsorshipPlan === "pro" ? "Pro profile" : "Profile"}
          </button>
        ) : null}

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
        availableProviders={WALLET_OPTIONS}
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
