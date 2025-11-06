import type { LoginType, RecoveryContact, SponsorshipEstimate, SponsorshipPlanId } from "./types";

const RAW_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const API_ROOT = `${RAW_API_BASE.replace(/\/$/, "")}/api/aa`;

async function safeReadError(response: Response): Promise<string | undefined> {
  try {
    const payload = await response.json();
    if (typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `Unable to reach Monolith API at ${API_ROOT}${path}. Verify the backend dev server is running and NEXT_PUBLIC_API_BASE_URL is set.`,
      { cause: error as Error }
    );
  }

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message ?? `API call to ${path} failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function startSession({
  loginType,
  email,
}: {
  loginType: LoginType;
  email?: string;
}): Promise<{ sessionId: string; ownerAddress: string }> {
  return request<{ sessionId: string; ownerAddress: string }>("/session", {
    method: "POST",
    body: JSON.stringify({ loginType, email }),
  });
}

export async function saveRecovery(payload: {
  sessionId: string;
  contacts: string[];
  threshold: number;
  passkeyEnrolled: boolean;
}): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/recovery", {
    method: "POST",
    body: JSON.stringify({
      sessionId: payload.sessionId,
      contacts: payload.contacts,
      threshold: payload.threshold,
      passkeyEnrolled: payload.passkeyEnrolled,
    }),
  });
}

export async function estimateSponsorship(plan: SponsorshipPlanId): Promise<SponsorshipEstimate> {
  const response = await request<{
    plan: SponsorshipPlanId;
    monthlyAllowance: number;
    currency: "USD";
    note: string;
    recommended: boolean;
  }>(`/sponsorships?plan=${plan}`, {
    method: "GET",
  });

  return {
    planId: response.plan,
    monthlyAllowance: response.monthlyAllowance,
    currency: response.currency,
    note: response.note,
    recommended: response.recommended,
  };
}

const TERMS_VERSION = "2025-02";

export async function finalizeOnboarding(payload: {
  sessionId: string;
  ownerAddress: string;
  loginType: LoginType;
  email?: string;
  contacts: RecoveryContact[];
  recoveryThreshold: number;
  passkeyEnrolled: boolean;
  plan: SponsorshipPlanId;
}): Promise<{
  accountAddress: string;
  paymasterPolicyId: string;
  status: "pending" | "completed";
}> {
  const response = await request<{
    smartAccountAddress: string;
    paymasterPolicyId: string;
    status: "pending" | "completed";
  }>("/onboard", {
    method: "POST",
    body: JSON.stringify({
      sessionId: payload.sessionId,
      accountIntent: {
        owner: payload.ownerAddress,
        loginType: payload.loginType,
        email: payload.email,
        recoveryContacts: payload.contacts.map((contact) => ({
          type: contact.type,
          value: contact.value,
        })),
        recoveryThreshold: payload.recoveryThreshold,
        passkeyEnrolled: payload.passkeyEnrolled,
      },
      sponsorship: {
        plan: payload.plan,
        acceptedTermsVersion: TERMS_VERSION,
      },
    }),
  });

  return {
    accountAddress: response.smartAccountAddress,
    paymasterPolicyId: response.paymasterPolicyId,
    status: response.status,
  };
}
