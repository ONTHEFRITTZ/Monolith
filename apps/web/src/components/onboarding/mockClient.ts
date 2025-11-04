import type { LoginType, SponsorshipEstimate, SponsorshipPlanId } from "./types";
import { defaultSponsorshipEstimate } from "./useOnboardingState";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const randomHex = () => {
  let hex = "0x";
  for (let index = 0; index < 40; index += 1) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return hex;
};

export async function startSession({
  loginType,
  email,
}: {
  loginType: LoginType;
  email?: string;
}): Promise<{ sessionId: string; ownerAddress: string }> {
  await delay(450);

  const prefix = loginType === "metamask" ? "mm" : loginType === "email" ? "em" : "sso";
  const serial =
    email
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .padEnd(6, "0")
      .slice(0, 6) ?? Math.random().toString(36).slice(2, 8);

  return {
    sessionId: `sess_${prefix}_${serial}`,
    ownerAddress: randomHex(),
  };
}

export async function saveRecovery(): Promise<{ success: true }> {
  await delay(300);
  return { success: true };
}

export async function estimateSponsorship(plan: SponsorshipPlanId): Promise<SponsorshipEstimate> {
  await delay(320);
  const estimate = defaultSponsorshipEstimate(plan);

  return {
    ...estimate,
    note:
      plan === "self"
        ? "You will sign every bridge intent and cover gas directly from your USDC balance."
        : estimate.note,
  };
}

export async function finalizeOnboarding(): Promise<{
  accountAddress: string;
  paymasterPolicyId: string;
}> {
  await delay(600);
  return {
    accountAddress: randomHex(),
    paymasterPolicyId: `paymaster_${Math.random().toString(36).slice(2, 9)}`,
  };
}
