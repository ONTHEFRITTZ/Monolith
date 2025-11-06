import { useMemo, useState } from "react";
import type {
  LinkedWallet,
  OnboardingActions,
  OnboardingState,
  OnboardingStep,
  RecoveryContact,
  SponsorshipEstimate,
  SponsorshipPlanId,
} from "./types";

const STEP_ORDER: OnboardingStep[] = ["identify", "secure", "gas", "review", "completed"];

const defaultState: OnboardingState = {
  currentStep: "identify",
  linkedWallets: [],
  contacts: [],
  recoveryThreshold: 2,
  passkeyEnrolled: false,
  socialLogins: [],
  sponsorshipPlan: "starter",
  sponsorshipEstimates: {},
  termsAccepted: false,
  isProcessing: false,
};

const getNextStep = (current: OnboardingStep): OnboardingStep => {
  const currentIndex = STEP_ORDER.indexOf(current);
  return STEP_ORDER[Math.min(currentIndex + 1, STEP_ORDER.length - 1)];
};

const getPreviousStep = (current: OnboardingStep): OnboardingStep => {
  const currentIndex = STEP_ORDER.indexOf(current);
  return STEP_ORDER[Math.max(currentIndex - 1, 0)];
};

export function useOnboardingState(initial?: Partial<OnboardingState>): {
  state: OnboardingState;
  actions: OnboardingActions;
} {
  const [state, setState] = useState<OnboardingState>({
    ...defaultState,
    ...initial,
    socialLogins: initial?.socialLogins ?? defaultState.socialLogins,
  });

  const actions = useMemo<OnboardingActions>(
    () => ({
      advance: () =>
        setState((prev) => ({
          ...prev,
          currentStep:
            prev.currentStep === "completed" ? "completed" : getNextStep(prev.currentStep),
          error: undefined,
        })),
      goBack: () =>
        setState((prev) => ({
          ...prev,
          currentStep: getPreviousStep(prev.currentStep),
          error: undefined,
        })),
      reset: () => setState({ ...defaultState }),
      setIdentify: ({ sessionId, loginType, ownerAddress, email }) =>
        setState((prev) => ({
          ...prev,
          sessionId,
          loginType,
          ownerAddress,
          email,
          linkedWallets: [],
          socialLogins: [],
        })),
      setLinkedWallets: (wallets) =>
        setState((prev) => ({
          ...prev,
          linkedWallets: dedupeWallets(wallets),
        })),
      addLinkedWallet: (wallet) =>
        setState((prev) => ({
          ...prev,
          linkedWallets: dedupeWallets([...prev.linkedWallets, wallet]),
        })),
      removeLinkedWallet: (address) =>
        setState((prev) => ({
          ...prev,
          linkedWallets: prev.linkedWallets.filter(
            (wallet) => wallet.address.toLowerCase() !== address.toLowerCase()
          ),
        })),
      setRecovery: ({ contacts, recoveryThreshold, passkeyEnrolled }) =>
        setState((prev) => ({
          ...prev,
          contacts,
          recoveryThreshold,
          passkeyEnrolled,
        })),
      setSponsorship: ({ plan, estimate, termsAccepted }) =>
        setState((prev) => ({
          ...prev,
          sponsorshipPlan: plan,
          sponsorshipEstimates: estimate
            ? { ...prev.sponsorshipEstimates, [estimate.planId]: estimate }
            : prev.sponsorshipEstimates,
          termsAccepted: typeof termsAccepted === "boolean" ? termsAccepted : prev.termsAccepted,
        })),
      setSocialLogins: (providers) =>
        setState((prev) => ({
          ...prev,
          socialLogins: Array.from(new Set(providers)),
        })),
      setPreferences: (prefs) =>
        setState((prev) => ({
          ...prev,
          preferences: prefs,
        })),
      setTermsAccepted: (accepted: boolean) =>
        setState((prev) => ({
          ...prev,
          termsAccepted: accepted,
        })),
      setProcessing: (value: boolean) =>
        setState((prev) => ({
          ...prev,
          isProcessing: value,
        })),
      setError: (message) =>
        setState((prev) => ({
          ...prev,
          error: message,
        })),
      complete: ({ accountAddress, paymasterPolicyId }) =>
        setState((prev) => ({
          ...prev,
          completedAccountAddress: accountAddress,
          paymasterPolicyId,
          currentStep: "completed",
          isProcessing: false,
          error: undefined,
        })),
    }),
    []
  );

  return { state, actions };
}

export function normaliseContacts(contacts: RecoveryContact[]): RecoveryContact[] {
  return contacts
    .filter((contact) => contact.value.trim().length > 0)
    .map((contact, index) => ({
      ...contact,
      value: contact.value.trim(),
      id: contact.id || `contact-${index}`,
    }));
}

export function defaultSponsorshipEstimate(plan: SponsorshipPlanId): SponsorshipEstimate {
  if (plan === "starter") {
    return {
      planId: "starter",
      monthlyAllowance: 50,
      currency: "USD",
      note: "Monolith covers up to $50 in gas fees per month for your intents.",
      recommended: true,
    };
  }

  if (plan === "pro") {
    return {
      planId: "pro",
      monthlyAllowance: 250,
      currency: "USD",
      note: "Ideal for power users processing high volumes with priority routing.",
      recommended: false,
    };
  }

  return {
    planId: "self",
    monthlyAllowance: 0,
    currency: "USD",
    note: "Bring your own gas. Paymaster will only intervene for stuck transactions.",
    recommended: false,
  };
}

function dedupeWallets(wallets: LinkedWallet[]): LinkedWallet[] {
  const seen = new Map<string, LinkedWallet>();
  wallets.forEach((wallet) => {
    const key = `${wallet.provider}:${wallet.address.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, wallet);
    }
  });
  return Array.from(seen.values());
}
