"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./OnboardingFlow.module.css";
import { OnboardingStepIdentify } from "./OnboardingStepIdentify";
import { OnboardingStepSecure } from "./OnboardingStepSecure";
import { OnboardingStepGas } from "./OnboardingStepGas";
import { OnboardingStepReview } from "./OnboardingStepReview";
import { OnboardingStepCompleted } from "./OnboardingStepCompleted";
import { useOnboardingState, normaliseContacts } from "./useOnboardingState";
import type { LinkedWallet, LoginType, SponsorshipPlanId } from "./types";
import type { WalletProvider } from "../bridge/types";
import { getConnector } from "@/lib/wallets/connectors";
import {
  estimateSponsorship,
  finalizeOnboarding,
  getSessionStatus,
  saveRecovery,
  startSession,
} from "./client";
import {
  queueAutoConnectWallets,
  writeProfile,
  clearProfileStorage,
  markProfileAcknowledged,
  fetchProfileFromServer,
} from "@/lib/profile";

const stepMeta = [
  { id: "identify", title: "Identify", description: "Connect your smart account." },
  { id: "secure", title: "Secure", description: "Set recovery and access controls." },
  { id: "gas", title: "Gas Plan", description: "Choose how gas is covered." },
  { id: "review", title: "Review", description: "Confirm details and create." },
  { id: "completed", title: "Completed", description: "Smart account ready." },
] as const;

const SESSION_STORAGE_KEY = "monolith:onboarding:session";

interface StoredOnboardingSession {
  sessionId: string;
  loginType: LoginType;
  ownerAddress: string;
  email?: string;
  status: "pending" | "completed" | "failed";
  linkedWallets?: LinkedWallet[];
  accountAddress?: string;
  paymasterPolicyId?: string;
  updatedAt: number;
  sponsorshipPlan?: SponsorshipPlanId;
  socialLogins?: Array<"google" | "apple">;
  preferences?: Record<string, unknown>;
}

export function OnboardingFlow() {
  const { state, actions } = useOnboardingState();
  const router = useRouter();
  const [stepBusy, setStepBusy] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState<WalletProvider | null>(null);
  const [hasResumed, setHasResumed] = useState(false);
  const [redirectScheduled, setRedirectScheduled] = useState(false);

  const currentIndex = useMemo(
    () => stepMeta.findIndex((step) => step.id === state.currentStep),
    [state.currentStep]
  );

  const handleError = useCallback(
    (message: string) => {
      actions.setError(message);
      setStepBusy(false);
    },
    [actions]
  );

  const handleSessionStart = useCallback(
    async ({ loginType, email }: { loginType: LoginType; email?: string }) => {
      try {
        setStepBusy(true);
        actions.setProcessing(true);
        const response = await startSession({ loginType, email });
        actions.setIdentify({
          sessionId: response.sessionId,
          loginType,
          ownerAddress: response.ownerAddress,
          email,
        });
        actions.setError(undefined);
        persistSession(response.sessionId, {
          loginType,
          ownerAddress: response.ownerAddress,
          email,
          status: "pending",
          linkedWallets: [],
          socialLogins: [],
        });
        actions.advance();
      } catch (error) {
        handleError("Unable to initialise session. Please try again.");
        console.error(error);
      } finally {
        actions.setProcessing(false);
        setStepBusy(false);
      }
    },
    [actions, handleError]
  );

  const handleToggleSocial = useCallback(
    (provider: "google" | "apple") => {
      const next = state.socialLogins.includes(provider)
        ? state.socialLogins.filter((value) => value !== provider)
        : [...state.socialLogins, provider];
      actions.setSocialLogins(next);
      if (state.sessionId) {
        persistSession(state.sessionId, {
          socialLogins: next,
        });
      }
    },
    [actions, state.sessionId, state.socialLogins]
  );

  const handleSaveRecovery = useCallback(
    async (payload: { contacts: string[]; passkeyEnrolled: boolean; threshold: number }) => {
      try {
        if (!state.sessionId) {
          throw new Error("Session unavailable. Restart onboarding.");
        }

        setStepBusy(true);
        actions.setProcessing(true);

        const contacts = normaliseContacts(
          payload.contacts.map((value, index) => ({
            id: `contact-${index}`,
            type: "email",
            value,
          }))
        );

        if (contacts.length === 0) {
          throw new Error("At least one recovery contact must be provided.");
        }

        await saveRecovery({
          sessionId: state.sessionId,
          contacts: contacts.map((contact) => contact.value),
          threshold: payload.threshold,
          passkeyEnrolled: payload.passkeyEnrolled,
        });
        actions.setRecovery({
          contacts,
          recoveryThreshold: payload.threshold,
          passkeyEnrolled: payload.passkeyEnrolled,
        });
        actions.setError(undefined);
        actions.advance();
      } catch (error) {
        handleError("Saving recovery preferences failed. Please review and retry.");
        console.error(error);
      } finally {
        actions.setProcessing(false);
        setStepBusy(false);
      }
    },
    [actions, handleError, state.sessionId]
  );

  const handlePlanSelect = useCallback(
    async (plan: SponsorshipPlanId) => {
      try {
        setStepBusy(true);
        actions.setProcessing(true);
        const estimate = await estimateSponsorship(plan);
        actions.setSponsorship({ plan, estimate });
        actions.setError(undefined);
      } catch (error) {
        handleError("We could not estimate sponsorship costs. Please pick again.");
        console.error(error);
      } finally {
        actions.setProcessing(false);
        setStepBusy(false);
      }
    },
    [actions, handleError]
  );

  const handleLinkWallet = useCallback(
    async (provider: WalletProvider) => {
      if (!state.sessionId) {
        actions.setError("Start a session before linking wallets.");
        return;
      }
      try {
        setLinkingProvider(provider);
        actions.setError(undefined);
        const connector = getConnector(provider);
        const result = await connector.connect();
        const deduped = dedupeLinkedWallets([
          ...state.linkedWallets,
          {
            provider,
            address: result.address,
            chains: result.chains,
          },
        ]);
        if (deduped.length === state.linkedWallets.length) {
          actions.setError("Wallet already linked.");
          return;
        }
        actions.setLinkedWallets(deduped);
        persistSession(state.sessionId, {
          linkedWallets: deduped,
          sponsorshipPlan: state.sponsorshipPlan,
          socialLogins: state.socialLogins,
        });
      } catch (error) {
        actions.setError("Unable to link wallet. Please try again.");
        console.error(error);
      } finally {
        setLinkingProvider(null);
      }
    },
    [actions, state.linkedWallets, state.sessionId, state.sponsorshipPlan, state.socialLogins]
  );

  const handleRemoveWallet = useCallback(
    (address: string) => {
      if (!state.sessionId) {
        actions.removeLinkedWallet(address);
        return;
      }
      const next = state.linkedWallets.filter(
        (wallet) => wallet.address.toLowerCase() !== address.toLowerCase()
      );
      actions.setLinkedWallets(next);
      persistSession(state.sessionId, {
        linkedWallets: next,
        sponsorshipPlan: state.sponsorshipPlan,
        socialLogins: state.socialLogins,
      });
    },
    [actions, state.linkedWallets, state.sessionId, state.sponsorshipPlan, state.socialLogins]
  );

  const handleReviewSubmit = useCallback(async () => {
    if (!state.sessionId || !state.loginType || !state.ownerAddress) {
      handleError("Session context missing. Restart onboarding.");
      return;
    }

    try {
      setStepBusy(true);
      actions.setProcessing(true);

      const response = await finalizeOnboarding({
        sessionId: state.sessionId,
        ownerAddress: state.ownerAddress,
        loginType: state.loginType,
        email: state.email,
        contacts: state.contacts,
        recoveryThreshold: state.recoveryThreshold,
        passkeyEnrolled: state.passkeyEnrolled,
        plan: state.sponsorshipPlan,
        linkedWallets: state.linkedWallets.map((wallet) => ({
          provider: wallet.provider,
          address: wallet.address,
          chains: wallet.chains,
        })),
        socialLogins: state.socialLogins,
        preferences: state.preferences,
      });

      if (response.status !== "completed") {
        throw new Error(`Unexpected onboarding status: ${response.status}`);
      }

      queueAutoConnectWallets(state.linkedWallets);
      markProfileAcknowledged();
      writeProfile({
        sessionId: state.sessionId,
        smartAccountAddress: response.accountAddress,
        ownerAddress: state.ownerAddress,
        loginType: state.loginType,
        paymasterPolicyId: response.paymasterPolicyId,
        linkedWallets: state.linkedWallets,
        sponsorshipPlan: state.sponsorshipPlan,
        socialLogins: state.socialLogins,
      });
      void fetchProfileFromServer(state.sessionId);

      actions.complete({
        accountAddress: response.accountAddress,
        paymasterPolicyId: response.paymasterPolicyId,
      });
      persistSession(state.sessionId, {
        status: response.status,
        accountAddress: response.accountAddress,
        paymasterPolicyId: response.paymasterPolicyId,
        linkedWallets: state.linkedWallets,
        sponsorshipPlan: state.sponsorshipPlan,
        socialLogins: state.socialLogins,
        preferences: state.preferences,
      });
    } catch (error) {
      handleError("Onboarding failed at review stage. Try again or contact support.");
      console.error(error);
    } finally {
      actions.setProcessing(false);
      setStepBusy(false);
    }
  }, [
    actions,
    handleError,
    state.contacts,
    state.email,
    state.linkedWallets,
    state.loginType,
    state.ownerAddress,
    state.passkeyEnrolled,
    state.recoveryThreshold,
    state.sessionId,
    state.sponsorshipPlan,
    state.socialLogins,
    state.preferences,
  ]);

  const handleReset = useCallback(() => {
    actions.reset();
    clearStoredSession();
    clearProfileStorage();
    setHasResumed(false);
  }, [actions]);

  useEffect(() => {
    if (hasResumed || typeof window === "undefined") {
      return;
    }

    const stored = readStoredSession();
    if (!stored) {
      setHasResumed(true);
      return;
    }

    const resume = async () => {
      const storedSocialLogins = stored.socialLogins ?? [];
      try {
        actions.setIdentify({
          sessionId: stored.sessionId,
          loginType: stored.loginType,
          ownerAddress: stored.ownerAddress,
          email: stored.email,
        });
        actions.setSocialLogins(storedSocialLogins);
        if (stored.linkedWallets?.length) {
          actions.setLinkedWallets(stored.linkedWallets);
        }
        actions.setError(undefined);

        if (stored.status !== "completed") {
          actions.advance();
        } else if (stored.accountAddress || stored.paymasterPolicyId) {
          const storedWallets = stored.linkedWallets ?? [];
          queueAutoConnectWallets(storedWallets);
          markProfileAcknowledged();
          const storedLoginType = stored.loginType ?? state.loginType;
          const storedOwner = stored.ownerAddress ?? state.ownerAddress;
          const storedAccount = stored.accountAddress ?? stored.ownerAddress ?? storedOwner ?? "";
          if (storedLoginType && storedAccount) {
            writeProfile({
              sessionId: stored.sessionId,
              smartAccountAddress: storedAccount,
              ownerAddress: storedOwner,
              loginType: storedLoginType,
              paymasterPolicyId: stored.paymasterPolicyId,
              linkedWallets: storedWallets,
              sponsorshipPlan: stored.sponsorshipPlan ?? state.sponsorshipPlan,
              socialLogins: storedSocialLogins,
            });
            void fetchProfileFromServer(stored.sessionId);
          }
          actions.complete({
            accountAddress: stored.accountAddress ?? stored.ownerAddress,
            paymasterPolicyId: stored.paymasterPolicyId ?? "",
          });
        }

        const status = await getSessionStatus(stored.sessionId);

        if (status.status === "failed") {
          actions.setError("Previous onboarding attempt failed. Please start again.");
          clearStoredSession();
          return;
        }
        const nextWallets = status.linkedWallets
          ? normaliseLinkedWallets(status.linkedWallets)
          : (stored.linkedWallets ?? []);
        actions.setLinkedWallets(nextWallets);
        persistSession(stored.sessionId, {
          status: status.status,
          ownerAddress: status.ownerAddress ?? stored.ownerAddress,
          email: status.email ?? stored.email,
          linkedWallets: nextWallets,
          accountAddress: status.smartAccountAddress ?? stored.accountAddress,
          paymasterPolicyId: status.paymasterPolicyId ?? stored.paymasterPolicyId,
          socialLogins: storedSocialLogins,
        });

        if (status.status === "completed") {
          queueAutoConnectWallets(nextWallets);
          markProfileAcknowledged();
          const statusLoginType = status.loginType ?? stored.loginType ?? state.loginType;
          const ownerAddress = status.ownerAddress ?? stored.ownerAddress ?? state.ownerAddress;
          const smartAccountAddress =
            status.smartAccountAddress ?? stored.accountAddress ?? ownerAddress ?? "";
          if (statusLoginType && smartAccountAddress) {
            writeProfile({
              sessionId: stored.sessionId,
              smartAccountAddress,
              ownerAddress,
              loginType: statusLoginType,
              paymasterPolicyId: status.paymasterPolicyId ?? stored.paymasterPolicyId,
              linkedWallets: nextWallets,
              sponsorshipPlan: stored.sponsorshipPlan ?? state.sponsorshipPlan,
              socialLogins: storedSocialLogins,
            });
            void fetchProfileFromServer(stored.sessionId);
          }
          actions.complete({
            accountAddress:
              status.smartAccountAddress ?? stored.accountAddress ?? stored.ownerAddress,
            paymasterPolicyId: status.paymasterPolicyId ?? stored.paymasterPolicyId ?? "",
          });
        }
      } catch (error) {
        console.error(error);
        clearStoredSession();
      } finally {
        setHasResumed(true);
      }
    };

    void resume();
  }, [actions, hasResumed, state.loginType, state.ownerAddress, state.sponsorshipPlan]);

  useEffect(() => {
    if (state.currentStep !== "completed" && redirectScheduled) {
      setRedirectScheduled(false);
    }
  }, [redirectScheduled, state.currentStep]);

  useEffect(() => {
    if (state.currentStep === "completed" && !redirectScheduled) {
      setRedirectScheduled(true);
      router.push("/bridge");
    }
  }, [redirectScheduled, router, state.currentStep]);

  const renderStep = () => {
    switch (state.currentStep) {
      case "identify":
        return (
          <OnboardingStepIdentify
            state={state}
            onMetaMask={() => handleSessionStart({ loginType: "metamask" })}
            onEmailSubmit={(email) => handleSessionStart({ loginType: "email", email })}
            onSocial={() => handleSessionStart({ loginType: "social" })}
            onToggleSocial={handleToggleSocial}
            socialLogins={state.socialLogins}
            isProcessing={stepBusy}
          />
        );
      case "secure":
        return (
          <OnboardingStepSecure
            state={state}
            onLinkWallet={handleLinkWallet}
            onRemoveWallet={handleRemoveWallet}
            linkingProvider={linkingProvider}
            onContinue={handleSaveRecovery}
            onBack={actions.goBack}
            isProcessing={stepBusy}
          />
        );
      case "gas":
        return (
          <OnboardingStepGas
            state={state}
            onPlanSelect={handlePlanSelect}
            onContinue={() => {
              actions.advance();
            }}
            onBack={actions.goBack}
            onTermsChange={actions.setTermsAccepted}
            isProcessing={stepBusy}
          />
        );
      case "review":
        return (
          <OnboardingStepReview
            state={state}
            onBack={actions.goBack}
            onSubmit={handleReviewSubmit}
            isProcessing={stepBusy}
          />
        );
      case "completed":
        return <OnboardingStepCompleted state={state} onReset={handleReset} />;
      default:
        return null;
    }
  };

  return (
    <section className={styles.wrapper}>
      <div className={styles.flowCard}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Smart Account Onboarding</p>
            <h1 className={styles.title}>{stepMeta[currentIndex]?.title ?? "Onboarding"}</h1>
            <p className={styles.subtitle}>{stepMeta[currentIndex]?.description ?? ""}</p>
          </div>
          <ol className={styles.progress} aria-label="Onboarding progress">
            {stepMeta.slice(0, -1).map((step, index) => {
              const isComplete = index < currentIndex;
              const isActive = index === currentIndex;

              return (
                <li
                  key={step.id}
                  className={`${styles.progressItem} ${
                    isComplete ? styles.progressItemComplete : ""
                  } ${isActive ? styles.progressItemActive : ""}`}
                >
                  <span className={styles.progressIndex}>{index + 1}</span>
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.description}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        </header>

        {state.error ? <div className={styles.error}>{state.error}</div> : null}

        <div className={styles.stepContainer}>{renderStep()}</div>
      </div>
    </section>
  );
}

function readStoredSession(): StoredOnboardingSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredOnboardingSession;
    return parsed.sessionId ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredOnboardingSession): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function persistSession(
  sessionId: string,
  patch: Partial<Omit<StoredOnboardingSession, "sessionId" | "updatedAt">> & {
    loginType?: LoginType;
    ownerAddress?: string;
  }
): StoredOnboardingSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const existing = readStoredSession();
  const isSameSession = existing && existing.sessionId === sessionId;

  if (!isSameSession && (!patch.loginType || !patch.ownerAddress)) {
    return null;
  }

  const base: StoredOnboardingSession =
    isSameSession && existing
      ? existing
      : {
          sessionId,
          loginType: patch.loginType as LoginType,
          ownerAddress: patch.ownerAddress as string,
          email: patch.email,
          status: patch.status ?? "pending",
          linkedWallets: patch.linkedWallets ? dedupeLinkedWallets(patch.linkedWallets) : [],
          accountAddress: patch.accountAddress,
          paymasterPolicyId: patch.paymasterPolicyId,
          updatedAt: Date.now(),
          sponsorshipPlan: patch.sponsorshipPlan ?? "starter",
          socialLogins: patch.socialLogins ?? [],
          preferences: patch.preferences,
        };

  const merged: StoredOnboardingSession = {
    ...base,
    sessionId,
    loginType: (patch.loginType ?? base.loginType) as LoginType,
    ownerAddress: (patch.ownerAddress ?? base.ownerAddress) as string,
    email: patch.email ?? base.email,
    status: patch.status ?? base.status,
    linkedWallets: patch.linkedWallets
      ? dedupeLinkedWallets(patch.linkedWallets)
      : base.linkedWallets,
    accountAddress: patch.accountAddress ?? base.accountAddress,
    paymasterPolicyId: patch.paymasterPolicyId ?? base.paymasterPolicyId,
    sponsorshipPlan: patch.sponsorshipPlan ?? base.sponsorshipPlan,
    socialLogins: patch.socialLogins ?? base.socialLogins ?? [],
    preferences: patch.preferences ?? base.preferences,
    updatedAt: Date.now(),
  };

  writeStoredSession(merged);
  return merged;
}

function clearStoredSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function dedupeLinkedWallets(wallets: LinkedWallet[]): LinkedWallet[] {
  const seen = new Map<string, LinkedWallet>();
  wallets.forEach((wallet) => {
    const key = `${wallet.provider}:${wallet.address.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, wallet);
    }
  });
  return Array.from(seen.values());
}

function normaliseLinkedWallets(
  wallets: Array<{ provider: string; address: string; chains: string[] }>
): LinkedWallet[] {
  return dedupeLinkedWallets(
    wallets
      .filter((wallet) => wallet.provider && wallet.address)
      .map((wallet) => ({
        provider: wallet.provider as WalletProvider,
        address: wallet.address,
        chains: wallet.chains as LinkedWallet["chains"],
      }))
  );
}
