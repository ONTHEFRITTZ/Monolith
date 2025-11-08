"use client";

import Image from "next/image";
import Link from "next/link";
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
import { PremiumConsoleModal } from "./PremiumConsoleModal";
import type { LinkedWallet, SponsorshipPlanId } from "../onboarding/types";
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
  const [premiumOpen, setPremiumOpen] = useState(false);
  const sessionId = profile?.sessionId;
  const { state, actions } = useBridgeState(sessionId);

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
    if (guestMode) {
      setProfileError(
        "Sign in to bridge with Monolith sponsorship. Onboarding unlocks the paymaster."
      );
      return;
    }
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

  const handlePlanSelect = useCallback(
    async (plan: SponsorshipPlanId) => {
      if (!profile?.sessionId) {
        setProfileOpen(true);
        setPricingOpen(false);
        return;
      }
      if (profile.sponsorshipPlan === plan) {
        setPricingOpen(false);
        return;
      }
      setPlanUpdating(true);
      setProfileError(null);
      try {
        const updated = await updateProfilePlan(profile.sessionId, plan);
        if (updated) {
          setProfile(updated);
          writeProfile(updated);
          setGuestMode(false);
          setProfileSettingsOpen(false);
          setPricingOpen(false);
        } else {
          setProfileError("Unable to update plan right now. Please retry later.");
        }
      } catch (error) {
        console.error(error);
        setProfileError("Plan update failed. Please retry.");
      } finally {
        setPlanUpdating(false);
      }
    },
    [profile]
  );

  const handleShowPlans = useCallback(() => {
    if (!profile?.sessionId) {
      setProfileOpen(true);
    }
    setPricingOpen(true);
  }, [profile]);

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

  const handleLinkWalletFromSettings = useCallback(
    async (provider: WalletProvider) => {
      const connection = await actions.connectProvider(provider);
      if (!connection) {
        return;
      }

      const linkedWallet: LinkedWallet = {
        provider: connection.provider,
        address: connection.address,
        chains: connection.chains,
      };

      const nextWallets = mergeLinkedWalletEntries(profile?.linkedWallets ?? [], linkedWallet);

      if (profile) {
        handleProfileMutation((current) => ({
          ...current,
          linkedWallets: mergeLinkedWalletEntries(current.linkedWallets ?? [], linkedWallet),
        }));
      }

      if (profile?.sessionId) {
        await handleProfileSettingsSave({ linkedWallets: nextWallets });
      }
    },
    [actions, handleProfileMutation, handleProfileSettingsSave, profile]
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

  const heroPrimary = useMemo(() => {
    if (!state.isConnected || state.connectedWallets.length === 0) {
      return guestMode
        ? "Connect MetaMask, Phantom, or Backpack to detect balances across your networks."
        : "";
    }
    return guestMode
      ? "Review balances as a guest. Sign in to bridge with Monolith sponsorship. Onboarding unlocks the paymaster."
      : "You're connected. Select a bridging pair below.";
  }, [guestMode, state.connectedWallets.length, state.isConnected]);

  const heroSecondary = useMemo(() => {
    if (guestMode) {
      return "";
    }
    if (!state.isConnected || state.connectedWallets.length === 0) {
      return "";
    }
    return "Need extra liquidity or routing priority? Open the console for premium flows.";
  }, [guestMode, state.connectedWallets.length, state.isConnected]);

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

  const handleProviderConnect = useCallback(
    async (provider: WalletProvider) => {
      if (guestMode && state.connectedWallets.length > 0) {
        setProfileError(
          "Guests can only connect one wallet at a time. Disconnect to switch wallets."
        );
        return;
      }
      await actions.connectProvider(provider);
    },
    [actions, guestMode, state.connectedWallets.length]
  );

  const renderWalletButtons = () => {
    if (!guestMode) {
      return null;
    }
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

  const shouldShowHeaderSignIn = guestMode && connectedCount === 0;

  return (
    <div className={styles.wrapper}>
      <header className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <div className={styles.brandMark}>
            <Image
              src="/logos/monolith-bridge.png"
              alt="Monolith Bridge"
              width={170}
              height={170}
              priority
            />
          </div>
        </div>
        <div className={styles.headerRight}>
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
                        onClick={() => void handleSignOut()}
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
                        onClick={() => void handleSignOut()}
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
          {shouldShowHeaderSignIn ? (
            <button
              type="button"
              className={styles.signInButton}
              onClick={() => router.push("/onboarding")}
            >
              Sign in
            </button>
          ) : null}
        </div>
      </header>

      <header className={styles.header}>
        <div className={styles.headerTopRow}>
          {guestMode ? (
            <button
              type="button"
              className={`${styles.signInButton} ${styles.signInButtonCompact}`}
              onClick={() => router.push("/onboarding")}
            >
              Sign in
            </button>
          ) : null}
        </div>
        {heroPrimary ? <p className={styles.subline}>{heroPrimary}</p> : null}
        {heroSecondary ? (
          <p className={`${styles.subline} ${styles.sublineSecondary}`}>{heroSecondary}</p>
        ) : null}

        {!profileOpen && renderWalletButtons()}

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
      ) : null}

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

      <PlansPricingModal
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        currentPlan={profile?.sponsorshipPlan ?? undefined}
        onSelectPlan={handlePlanSelect}
        isUpdating={planUpdating}
      />
      <div className={styles.floatingButtonDock}>
        {!guestMode ? (
          <Link href="/ramp" className={styles.rampFloatingButton}>
            On / Off ramp
          </Link>
        ) : null}
        {!guestMode ? (
          <>
            <button
              type="button"
              className={styles.planFloatingButton}
              onClick={() => setPricingOpen(true)}
            >
              Plans &amp; pricing
            </button>
            <button
              type="button"
              className={styles.consoleFloatingButton}
              onClick={() => setPremiumOpen(true)}
            >
              Console
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.planFloatingButton}
            onClick={() => setPricingOpen(true)}
          >
            Plans &amp; pricing
          </button>
        )}
      </div>
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
        onUpgradePlan={handleShowPlans}
        availableProviders={availableProviders}
        walletLogos={WALLET_LOGOS}
        isBusy={state.isLoading || planUpdating || settingsUpdating}
      />
      <PremiumConsoleModal
        open={premiumOpen}
        profile={profile}
        onClose={() => setPremiumOpen(false)}
        onSave={handleProfileSettingsSave}
        isBusy={state.isLoading || settingsUpdating}
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

function mergeLinkedWalletEntries(
  existing: LinkedWallet[],
  incoming: LinkedWallet
): LinkedWallet[] {
  const map = new Map<string, LinkedWallet>();
  existing.forEach((wallet) => {
    const key = `${wallet.provider}:${wallet.address.toLowerCase()}`;
    map.set(key, {
      ...wallet,
      chains: Array.from(new Set(wallet.chains)),
    });
  });

  const incomingKey = `${incoming.provider}:${incoming.address.toLowerCase()}`;
  map.set(incomingKey, {
    ...incoming,
    chains: Array.from(new Set(incoming.chains)),
  });

  return Array.from(map.values());
}
