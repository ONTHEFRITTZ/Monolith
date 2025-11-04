import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const metadata: Metadata = {
  title: "Mon-olith · Smart Account Onboarding",
  description:
    "Create your Monad smart account with MetaMask and Alchemy Smart Wallet SDK support, recovery controls, and gas sponsorship plans.",
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
