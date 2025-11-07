"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import type { StoredProfile } from "@/lib/profile";
import styles from "./OnOffRamp.module.css";
import bridgeStyles from "../bridge/BridgeFlow.module.css";
import { useBridgeState } from "../bridge/useBridgeState";
import type { WalletProvider, WalletConnection } from "../bridge/types";
import { providerLabel } from "../bridge/bridgeClient";
import { ProfilePromptModal } from "../bridge/ProfilePromptModal";
import { ProfileSettingsModal } from "../bridge/ProfileSettingsModal";
import { PlansPricingModal } from "../bridge/PlansPricingModal";
import { PremiumConsoleModal } from "../bridge/PremiumConsoleModal";
import type { LinkedWallet } from "../onboarding/types";
import {
  submitOffRamp,
  submitOnRamp,
  type RampActionResponse,
  type RampCurrency,
  type RampProvider,
} from "./rampClient";

const WALLET_OPTIONS: WalletProvider[] = ["metamask", "phantom", "backpack"];
const PROVIDER_DISPLAY_ORDER: WalletProvider[] = ["metamask", "phantom", "backpack"];
const WALLET_LOGOS: Record<WalletProvider, string> = {
  metamask: "/logos/metamask.png",
  phantom: "/logos/phantom.png",
  backpack: "/logos/backpack.png",
};

const RAMP_PROVIDER_OPTIONS: Array<{ id: RampProvider; label: string; detail: string }> = [
  { id: "paypal", label: "PayPal", detail: "Instant retail rails" },
  { id: "stripe", label: "Stripe", detail: "Card & merchant accounts" },
  { id: "circle", label: "Circle CCTP", detail: "Institutional wires" },
];

const FIAT_OPTIONS: RampCurrency[] = ["USD", "CAD", "EUR"];

type OnRampFormState = {
  provider: RampProvider;
  currency: RampCurrency;
  amount: string;
  destinationWallet: string;
  contactEmail: string;
  accountReference: string;
  institutionName: string;
  notes: string;
};

type OffRampFormState = {
  provider: RampProvider;
  currency: RampCurrency;
  amount: string;
  sourceWallet: string;
  contactEmail: string;
  accountReference: string;
  institutionName: string;
  notes: string;
};

export function OnOffRampView() {
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [guestMode, setGuestMode] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [planUpdating, setPlanUpdating] = useState(false);
  const [settingsUpdating, setSettingsUpdating] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [autoConnectProviders, setAutoConnectProviders] = useState<WalletProvider[] | null>(null);
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [profilePromptInitialized, setProfilePromptInitialized] = useState(false);
  const sessionId = profile?.sessionId;
  const { state, actions } = useBridgeState(sessionId);
  const [onRampForm, setOnRampForm] = useState<OnRampFormState>({
    provider: "paypal",
    currency: "USD",
    amount: "",
    destinationWallet: "",
    contactEmail: "",
    accountReference: "",
    institutionName: "",
    notes: "",
  });
  const [onRampSubmitting, setOnRampSubmitting] = useState(false);
  const [onRampError, setOnRampError] = useState<string | null>(null);
  const [onRampResult, setOnRampResult] = useState<RampActionResponse | null>(null);

  const [offRampForm, setOffRampForm] = useState<OffRampFormState>({
    provider: "paypal",
    currency: "USD",
    amount: "",
    sourceWallet: "",
    contactEmail: "",
    accountReference: "",
    institutionName: "",
    notes: "",
  });
  const [offRampSubmitting, setOffRampSubmitting] = useState(false);
  const [offRampError, setOffRampError] = useState<string | null>(null);
  const [offRampResult, setOffRampResult] = useState<RampActionResponse | null>(null);

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

  const updateOnRampForm = useCallback((field: keyof OnRampFormState, value: string) => {
    setOnRampForm((prev) => ({ ...prev, [field]: value }));
    setOnRampError(null);
    setOnRampResult(null);
  }, []);

  const updateOffRampForm = useCallback((field: keyof OffRampFormState, value: string) => {
    setOffRampForm((prev) => ({ ...prev, [field]: value }));
    setOffRampError(null);
    setOffRampResult(null);
  }, []);

  const handleOnRampSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (orderedConnections.length === 0) {
        setOnRampError("Connect at least one wallet to request an on-ramp.");
        return;
      }

      const amount = Number(onRampForm.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setOnRampError("Enter a valid amount greater than zero.");
        return;
      }
      if (!onRampForm.destinationWallet) {
        setOnRampError("Select a destination wallet.");
        return;
      }
      if (!onRampForm.contactEmail) {
        setOnRampError("Provide a contact email so we can share settlement instructions.");
        return;
      }
      if (onRampForm.provider === "stripe" && !onRampForm.accountReference) {
        setOnRampError("Stripe transfers require an account ID or descriptor.");
        return;
      }
      if (onRampForm.provider === "circle" && !onRampForm.institutionName) {
        setOnRampError("Circle requests require an institution name.");
        return;
      }

      setOnRampSubmitting(true);
      setOnRampError(null);
      setOnRampResult(null);

      try {
        const response = await submitOnRamp({
          provider: onRampForm.provider,
          amount,
          currency: onRampForm.currency,
          destinationWallet: onRampForm.destinationWallet,
          contactEmail: onRampForm.contactEmail,
          accountReference: blankToUndefined(onRampForm.accountReference),
          institutionName: blankToUndefined(onRampForm.institutionName),
          notes: blankToUndefined(onRampForm.notes),
          sessionId: sessionId ?? undefined,
        });
        setOnRampResult(response);
      } catch (error) {
        setOnRampError(
          error instanceof Error ? error.message : "Failed to submit on-ramp request."
        );
      } finally {
        setOnRampSubmitting(false);
      }
    },
    [onRampForm, orderedConnections.length, sessionId]
  );

  const handleOffRampSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (orderedConnections.length === 0) {
        setOffRampError("Connect at least one wallet to schedule an off-ramp.");
        return;
      }

      const amount = Number(offRampForm.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setOffRampError("Enter a valid amount greater than zero.");
        return;
      }
      if (!offRampForm.sourceWallet) {
        setOffRampError("Select the wallet we should burn USDC from.");
        return;
      }
      if (!offRampForm.contactEmail) {
        setOffRampError("Provide a contact email so we can send payout updates.");
        return;
      }
      if (!offRampForm.accountReference) {
        setOffRampError(
          offRampForm.provider === "paypal"
            ? "PayPal payouts need the receiving account email."
            : "Provide the receiving account reference."
        );
        return;
      }
      if (offRampForm.provider === "circle" && !offRampForm.institutionName) {
        setOffRampError("Circle payouts require an institution name.");
        return;
      }

      setOffRampSubmitting(true);
      setOffRampError(null);
      setOffRampResult(null);

      try {
        const response = await submitOffRamp({
          provider: offRampForm.provider,
          amount,
          currency: offRampForm.currency,
          sourceWallet: offRampForm.sourceWallet,
          contactEmail: offRampForm.contactEmail,
          accountReference: offRampForm.accountReference,
          institutionName: blankToUndefined(offRampForm.institutionName),
          notes: blankToUndefined(offRampForm.notes),
          sessionId: sessionId ?? undefined,
        });
        setOffRampResult(response);
      } catch (error) {
        setOffRampError(
          error instanceof Error ? error.message : "Failed to submit off-ramp request."
        );
      } finally {
        setOffRampSubmitting(false);
      }
    },
    [offRampForm, orderedConnections.length, sessionId]
  );

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
  }, [profile]);

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

  useEffect(() => {
    const addresses = orderedConnections.map((wallet) => wallet.address);
    const fallback = addresses[0] ?? "";

    setOnRampForm((prev) => {
      const shouldKeep =
        prev.destinationWallet !== "" && addresses.includes(prev.destinationWallet);
      const nextAddress = shouldKeep ? prev.destinationWallet : fallback;
      if (nextAddress === prev.destinationWallet) {
        return prev;
      }
      return { ...prev, destinationWallet: nextAddress ?? "" };
    });

    setOffRampForm((prev) => {
      const shouldKeep = prev.sourceWallet !== "" && addresses.includes(prev.sourceWallet);
      const nextAddress = shouldKeep ? prev.sourceWallet : fallback;
      if (nextAddress === prev.sourceWallet) {
        return prev;
      }
      return { ...prev, sourceWallet: nextAddress ?? "" };
    });
  }, [orderedConnections]);

  return (
    <div className={styles.wrapper}>
      <header className={bridgeStyles.headerBar}>
        <div className={bridgeStyles.brandMark}>
          <Image
            src="/logos/monolith-bridge.png"
            alt="Monolith Bridge"
            width={170}
            height={170}
            priority
          />
        </div>
        <div className={bridgeStyles.connectedPillFixed}>
          <div className={bridgeStyles.connectedPillRow}>
            <span className={bridgeStyles.connectedHeading}>
              {connectedCount} wallet{connectedCount === 1 ? "" : "s"} connected
            </span>
            <div className={bridgeStyles.connectedActions}>
              {guestMode ? (
                <>
                  <button
                    type="button"
                    className={`${bridgeStyles.pillButton} ${bridgeStyles.pillButtonSecondary}`}
                    onClick={() => router.push("/onboarding")}
                    disabled={state.isLoading}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={`${bridgeStyles.pillButton} ${bridgeStyles.pillButtonPrimary}`}
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
                    className={`${bridgeStyles.pillButton} ${bridgeStyles.pillButtonSecondary}`}
                    onClick={() => setProfileSettingsOpen(true)}
                    disabled={state.isLoading}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className={`${bridgeStyles.pillButton} ${bridgeStyles.pillButtonPrimary}`}
                    onClick={() => void handleSignOut()}
                    disabled={state.isLoading}
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
          <ul className={bridgeStyles.connectedWalletList}>
            {orderedConnections.map((wallet) => (
              <li
                key={`${wallet.provider}:${wallet.address}`}
                className={bridgeStyles.connectedWalletItem}
              >
                <span className={bridgeStyles.connectedWalletIcon}>
                  <Image
                    src={WALLET_LOGOS[wallet.provider]}
                    alt={`${providerLabel(wallet.provider)} logo`}
                    width={20}
                    height={20}
                  />
                </span>
                <div className={bridgeStyles.connectedWalletText}>
                  <span className={bridgeStyles.connectedWalletProvider}>
                    {providerLabel(wallet.provider)}
                  </span>
                  <span className={bridgeStyles.connectedWalletAddress}>
                    {shortAddress(wallet.address)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </header>
      <main className={styles.content}>
        {profileError ? <p className={styles.inlineError}>{profileError}</p> : null}
        <header className={styles.header}>
          <h1 className={styles.title}>ON | OFF RAMP</h1>
          <p className={styles.subtitle}>
            Institutional-grade fiat access powered by Circle Mint 4 and (soon) CCTP v2 on Monad.
            Request early access to wire funds directly into Mon-olith intents, or schedule off-ramp
            payouts when you exit liquidity.
          </p>
        </header>

        <section className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>On-Ramp (Fiat → USDC)</h3>
                <p>
                  Generate PayPal or Stripe deposits instantly, or route institutional wires through
                  Circle CCTP. Every request mints USDC straight into your connected wallet once the
                  fiat leg clears.
                </p>
              </div>
              <div className={styles.providerToggle}>
                {RAMP_PROVIDER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`${styles.providerChoice} ${
                      onRampForm.provider === option.id ? styles.providerChoiceActive : ""
                    }`}
                    onClick={() => updateOnRampForm("provider", option.id)}
                  >
                    <span>{option.label}</span>
                    <small>{option.detail}</small>
                  </button>
                ))}
              </div>
            </div>

            <form className={styles.form} onSubmit={handleOnRampSubmit}>
              <div className={styles.fieldGroup}>
                <label>Transfer amount</label>
                <div className={styles.amountRow}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={onRampForm.amount}
                    onChange={(event) => updateOnRampForm("amount", event.target.value)}
                    placeholder="0.00"
                  />
                  <select
                    value={onRampForm.currency}
                    onChange={(event) =>
                      updateOnRampForm("currency", event.target.value as RampCurrency)
                    }
                  >
                    {FIAT_OPTIONS.map((fiat) => (
                      <option key={fiat} value={fiat}>
                        {fiat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label>Deposit to</label>
                <select
                  value={onRampForm.destinationWallet}
                  onChange={(event) => updateOnRampForm("destinationWallet", event.target.value)}
                  disabled={connectedCount === 0}
                >
                  {connectedCount === 0 ? (
                    <option value="">Connect a wallet to continue</option>
                  ) : null}
                  {orderedConnections.map((wallet) => (
                    <option key={wallet.address} value={wallet.address}>
                      {providerLabel(wallet.provider)} · {shortAddress(wallet.address)}
                    </option>
                  ))}
                </select>
                {connectedCount === 0 ? (
                  <p className={styles.fieldHint}>
                    Connect a wallet from the header to unlock ramps.
                  </p>
                ) : null}
              </div>

              <div className={styles.fieldGroup}>
                <label>
                  {onRampForm.provider === "paypal" ? "PayPal email" : "Ops contact email"}
                </label>
                <input
                  type="email"
                  value={onRampForm.contactEmail}
                  onChange={(event) => updateOnRampForm("contactEmail", event.target.value)}
                  placeholder={
                    onRampForm.provider === "paypal" ? "you@company.com" : "treasury@desk.com"
                  }
                />
              </div>

              {onRampForm.provider === "stripe" ? (
                <div className={styles.fieldGroup}>
                  <label>Stripe account / descriptor</label>
                  <input
                    type="text"
                    value={onRampForm.accountReference}
                    onChange={(event) => updateOnRampForm("accountReference", event.target.value)}
                    placeholder="acct_123 / transfer group"
                  />
                </div>
              ) : null}

              {onRampForm.provider === "circle" ? (
                <div className={styles.fieldGroup}>
                  <label>Institution name</label>
                  <input
                    type="text"
                    value={onRampForm.institutionName}
                    onChange={(event) => updateOnRampForm("institutionName", event.target.value)}
                    placeholder="Example Capital LP"
                  />
                </div>
              ) : null}

              <div className={styles.fieldGroup}>
                <label>Notes (optional)</label>
                <textarea
                  rows={2}
                  value={onRampForm.notes}
                  onChange={(event) => updateOnRampForm("notes", event.target.value)}
                  placeholder="Reference desk, cutoff preferences, etc."
                />
              </div>

              {onRampError ? <p className={styles.formError}>{onRampError}</p> : null}

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={onRampSubmitting || connectedCount === 0}
              >
                {onRampSubmitting ? "Generating instructions..." : "Generate instructions"}
              </button>
            </form>

            {onRampResult ? (
              <div className={styles.resultCard}>
                <div className={styles.resultMeta}>
                  <span>Ref: {onRampResult.referenceCode}</span>
                  <span>ETA ~ {onRampResult.etaMinutes} min</span>
                </div>
                <p className={styles.resultSummary}>{onRampResult.summary}</p>
                <ol className={styles.resultList}>
                  {onRampResult.instructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>Off-Ramp (USDC → Fiat)</h3>
                <p>
                  Queue payouts to PayPal, Stripe, or institutional bank accounts once your bridge
                  exits settle. We burn USDC from the wallet you choose and handle the compliance +
                  fiat leg for you.
                </p>
              </div>
              <div className={styles.providerToggle}>
                {RAMP_PROVIDER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`${styles.providerChoice} ${
                      offRampForm.provider === option.id ? styles.providerChoiceActive : ""
                    }`}
                    onClick={() => updateOffRampForm("provider", option.id)}
                  >
                    <span>{option.label}</span>
                    <small>{option.detail}</small>
                  </button>
                ))}
              </div>
            </div>

            <form className={styles.form} onSubmit={handleOffRampSubmit}>
              <div className={styles.fieldGroup}>
                <label>Payout amount</label>
                <div className={styles.amountRow}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={offRampForm.amount}
                    onChange={(event) => updateOffRampForm("amount", event.target.value)}
                    placeholder="0.00"
                  />
                  <select
                    value={offRampForm.currency}
                    onChange={(event) =>
                      updateOffRampForm("currency", event.target.value as RampCurrency)
                    }
                  >
                    {FIAT_OPTIONS.map((fiat) => (
                      <option key={fiat} value={fiat}>
                        {fiat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label>Burn from</label>
                <select
                  value={offRampForm.sourceWallet}
                  onChange={(event) => updateOffRampForm("sourceWallet", event.target.value)}
                  disabled={connectedCount === 0}
                >
                  {connectedCount === 0 ? (
                    <option value="">Connect a wallet to continue</option>
                  ) : null}
                  {orderedConnections.map((wallet) => (
                    <option key={wallet.address} value={wallet.address}>
                      {providerLabel(wallet.provider)} · {shortAddress(wallet.address)}
                    </option>
                  ))}
                </select>
                {connectedCount === 0 ? (
                  <p className={styles.fieldHint}>
                    Connect a wallet from the header to unlock ramps.
                  </p>
                ) : null}
              </div>

              <div className={styles.fieldGroup}>
                <label>Contact email</label>
                <input
                  type="email"
                  value={offRampForm.contactEmail}
                  onChange={(event) => updateOffRampForm("contactEmail", event.target.value)}
                  placeholder="ops@company.com"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label>
                  {offRampForm.provider === "paypal"
                    ? "PayPal payout email"
                    : "Receiving account reference"}
                </label>
                <input
                  type="text"
                  value={offRampForm.accountReference}
                  onChange={(event) => updateOffRampForm("accountReference", event.target.value)}
                  placeholder={
                    offRampForm.provider === "paypal" ? "you@company.com" : "acct_123 / bank alias"
                  }
                />
              </div>

              {offRampForm.provider === "circle" ? (
                <div className={styles.fieldGroup}>
                  <label>Institution name</label>
                  <input
                    type="text"
                    value={offRampForm.institutionName}
                    onChange={(event) => updateOffRampForm("institutionName", event.target.value)}
                    placeholder="Example Capital LP"
                  />
                </div>
              ) : null}

              <div className={styles.fieldGroup}>
                <label>Notes (optional)</label>
                <textarea
                  rows={2}
                  value={offRampForm.notes}
                  onChange={(event) => updateOffRampForm("notes", event.target.value)}
                  placeholder="Bank cutoffs, AML references, etc."
                />
              </div>

              {offRampError ? <p className={styles.formError}>{offRampError}</p> : null}

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={offRampSubmitting || connectedCount === 0}
              >
                {offRampSubmitting ? "Scheduling payout..." : "Schedule payout"}
              </button>
            </form>

            {offRampResult ? (
              <div className={styles.resultCard}>
                <div className={styles.resultMeta}>
                  <span>Ref: {offRampResult.referenceCode}</span>
                  <span>ETA ~ {offRampResult.etaMinutes} min</span>
                </div>
                <p className={styles.resultSummary}>{offRampResult.summary}</p>
                <ol className={styles.resultList}>
                  {offRampResult.instructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </article>
        </section>

        <p className={styles.note}>
          Need help?{" "}
          <Link href="mailto:support@mon-olith.xyz" className={styles.secondaryButton}>
            Contact our treasury desk
          </Link>
        </p>
      </main>

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

      <PlansPricingModal
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        onUpgradePlan={handleUpgradePlan}
        isUpdating={planUpdating}
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

function shortAddress(address: string): string {
  if (address.length <= 10) {
    return address;
  }
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
  existing.forEach((wallet) => map.set(wallet.provider, wallet));
  map.set(incoming.provider, incoming);
  return Array.from(map.values());
}

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
