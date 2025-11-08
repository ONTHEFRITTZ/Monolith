import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const metadata: Metadata = {
  title: "Monolith · Smart Account Onboarding",
  description:
    "Create your Monad Smart Wallet with SDK support, recovery controls, and gas sponsorship plans.",
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
