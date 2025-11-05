"use client";
import { useCallback, useMemo, useState } from "react";
import styles from "./OnboardingFlow.module.css";
import { OnboardingStepIdentify } from "./OnboardingStepIdentify";
import { OnboardingStepSecure } from "./OnboardingStepSecure";
import { OnboardingStepGas } from "./OnboardingStepGas";
import { OnboardingStepReview } from "./OnboardingStepReview";
import { OnboardingStepCompleted } from "./OnboardingStepCompleted";
import { useOnboardingState, normaliseContacts } from "./useOnboardingState";
import type { LoginType, SponsorshipPlanId } from "./types";
import { estimateSponsorship, finalizeOnboarding, saveRecovery, startSession } from "./client";

const stepMeta = [
  { id: "identify", title: "Identify", description: "Connect your smart account." },
  { id: "secure", title: "Secure", description: "Set recovery and access controls." },
  { id: "gas", title: "Gas Plan", description: "Choose how gas is covered." },
  { id: "review", title: "Review", description: "Confirm details and create." },
  { id: "completed", title: "Completed", description: "Smart account ready." },
] as const;

export function OnboardingFlow() {
  const { state, actions } = useOnboardingState();
  const [stepBusy, setStepBusy] = useState(false);

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

  const handleReviewSubmit = useCallback(async () => {
    if (!state.sessionId || !state.loginType || !state.ownerAddress) {
      handleError("Session information is incomplete. Restart onboarding.");
      return;
    }
    if (!state.termsAccepted) {
      handleError("Please accept the sponsorship terms before continuing.");
      return;
    }
    if (!state.contacts || state.contacts.length === 0) {
      handleError("Add at least one recovery contact before continuing.");
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
      });

      if (response.status !== "completed") {
        throw new Error(`Unexpected onboarding status: ${response.status}`);
      }

      actions.complete({
        accountAddress: response.accountAddress,
        paymasterPolicyId: response.paymasterPolicyId,
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
    state.loginType,
    state.ownerAddress,
    state.passkeyEnrolled,
    state.recoveryThreshold,
    state.sessionId,
    state.sponsorshipPlan,
    state.termsAccepted,
  ]);

  const renderStep = () => {
    switch (state.currentStep) {
      case "identify":
        return (
          <OnboardingStepIdentify
            state={state}
            onMetaMask={() => handleSessionStart({ loginType: "metamask" })}
            onEmailSubmit={(email) => handleSessionStart({ loginType: "email", email })}
            onSocial={() => handleSessionStart({ loginType: "social" })}
            isProcessing={stepBusy}
          />
        );
      case "secure":
        return (
          <OnboardingStepSecure
            state={state}
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
        return <OnboardingStepCompleted state={state} onReset={actions.reset} />;
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

export default OnboardingFlow;
