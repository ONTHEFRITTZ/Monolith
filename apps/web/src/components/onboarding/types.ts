import type { SupportedChain, WalletProvider } from "../bridge/types";

export type OnboardingStep = "identify" | "secure" | "gas" | "review" | "completed";

export type LoginType = "metamask" | "email" | "social";

export type SponsorshipPlanId = "starter" | "pro" | "self";

export interface RecoveryContact {
  id: string;
  type: "email" | "phone";
  value: string;
}

export interface SponsorshipEstimate {
  planId: SponsorshipPlanId;
  monthlyAllowance: number;
  currency: "USD";
  note: string;
  recommended: boolean;
}

export interface LinkedWallet {
  provider: WalletProvider;
  address: string;
  chains: SupportedChain[];
}

export interface OnboardingState {
  currentStep: OnboardingStep;
  sessionId?: string;
  loginType?: LoginType;
  ownerAddress?: string;
  email?: string;
  linkedWallets: LinkedWallet[];
  contacts: RecoveryContact[];
  recoveryThreshold: number;
  passkeyEnrolled: boolean;
  sponsorshipPlan: SponsorshipPlanId;
  sponsorshipEstimates: Partial<Record<SponsorshipPlanId, SponsorshipEstimate>>;
  termsAccepted: boolean;
  isProcessing: boolean;
  error?: string;
  completedAccountAddress?: string;
  paymasterPolicyId?: string;
}

export interface OnboardingActions {
  advance: () => void;
  goBack: () => void;
  reset: () => void;
  setIdentify: (payload: {
    sessionId: string;
    loginType: LoginType;
    ownerAddress: string;
    email?: string;
  }) => void;
  setLinkedWallets: (wallets: LinkedWallet[]) => void;
  addLinkedWallet: (wallet: LinkedWallet) => void;
  removeLinkedWallet: (address: string) => void;
  setRecovery: (payload: {
    contacts: RecoveryContact[];
    recoveryThreshold: number;
    passkeyEnrolled: boolean;
  }) => void;
  setSponsorship: (payload: {
    plan: SponsorshipPlanId;
    estimate?: SponsorshipEstimate;
    termsAccepted?: boolean;
  }) => void;
  setTermsAccepted: (accepted: boolean) => void;
  setProcessing: (value: boolean) => void;
  setError: (message?: string) => void;
  complete: (payload: { accountAddress: string; paymasterPolicyId: string }) => void;
}
