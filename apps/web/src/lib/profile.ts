import type { WalletProvider } from "@/components/bridge/types";
import type { LinkedWallet, LoginType, SponsorshipPlanId } from "@/components/onboarding/types";

export type SocialProvider = "google" | "apple";

export interface ProfilePreferences {
  analyticsApi?: boolean;
  complianceAlerts?: boolean;
  marketplaceAccess?: boolean;
  insightsOptIn?: boolean;
}

export interface StoredProfile {
  sessionId: string;
  smartAccountAddress: string;
  ownerAddress?: string;
  loginType: LoginType;
  paymasterPolicyId?: string;
  linkedWallets: LinkedWallet[];
  sponsorshipPlan: SponsorshipPlanId;
  socialLogins?: SocialProvider[];
  preferences?: ProfilePreferences;
}

export const PROFILE_STORAGE_KEY = "monolith:profile";
export const AUTO_CONNECT_STORAGE_KEY = "monolith:bridge:autoConnect";
export const PROFILE_ACK_STORAGE_KEY = "monolith:bridge:profileAcknowledged";

const isBrowser = () => typeof window !== "undefined";

export function readProfile(): StoredProfile | null {
  if (!isBrowser()) {
    return null;
  }
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredProfile;
  } catch (error) {
    console.error("Failed to parse stored profile", error);
    return null;
  }
}

export function writeProfile(profile: StoredProfile): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearProfileStorage(): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  window.localStorage.removeItem(AUTO_CONNECT_STORAGE_KEY);
  window.localStorage.removeItem(PROFILE_ACK_STORAGE_KEY);
}

export function markProfileAcknowledged(): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(PROFILE_ACK_STORAGE_KEY, "true");
}

export function isProfileAcknowledged(): boolean {
  if (!isBrowser()) {
    return false;
  }
  return window.localStorage.getItem(PROFILE_ACK_STORAGE_KEY) === "true";
}

export function queueAutoConnectWallets(wallets: LinkedWallet[]): void {
  const providers = Array.from(new Set(wallets.map((wallet) => wallet.provider)));
  if (providers.length === 0) {
    return;
  }
  queueAutoConnectProviders(providers);
}

export function queueAutoConnectProviders(providers: WalletProvider[]): void {
  if (!isBrowser() || providers.length === 0) {
    return;
  }
  let existing: WalletProvider[] = [];
  const raw = window.localStorage.getItem(AUTO_CONNECT_STORAGE_KEY);
  if (raw) {
    try {
      existing = JSON.parse(raw) as WalletProvider[];
    } catch (error) {
      console.error("Failed to parse existing auto-connect queue", error);
      existing = [];
    }
  }
  const merged = Array.from(new Set([...existing, ...providers]));
  window.localStorage.setItem(AUTO_CONNECT_STORAGE_KEY, JSON.stringify(merged));
}

export function consumeAutoConnectProviders(): WalletProvider[] {
  if (!isBrowser()) {
    return [];
  }
  const raw = window.localStorage.getItem(AUTO_CONNECT_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  window.localStorage.removeItem(AUTO_CONNECT_STORAGE_KEY);
  try {
    const providers = JSON.parse(raw) as WalletProvider[];
    return Array.isArray(providers) ? providers : [];
  } catch (error) {
    console.error("Failed to parse auto-connect providers", error);
    return [];
  }
}

export function updateProfile(
  updater: (current: StoredProfile | null) => StoredProfile | null
): StoredProfile | null {
  const current = readProfile();
  const next = updater(current);
  if (next) {
    writeProfile(next);
    return next;
  }
  clearProfileStorage();
  return null;
}

export function providersFromProfile(profile: StoredProfile | null): WalletProvider[] {
  if (!profile?.linkedWallets) {
    return [];
  }
  return Array.from(new Set(profile.linkedWallets.map((wallet) => wallet.provider)));
}

function buildApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  return `${base.replace(/\/$/, "")}/api/aa`;
}

function normaliseLinkedWallets(
  wallets: Array<{ provider?: string; address?: string; chains?: string[] }> | undefined
): LinkedWallet[] {
  if (!wallets || wallets.length === 0) {
    return [];
  }
  const seen = new Map<string, LinkedWallet>();
  wallets.forEach((wallet) => {
    const provider = wallet.provider as WalletProvider | undefined;
    const address = typeof wallet.address === "string" ? wallet.address : undefined;
    if (!provider || !address) {
      return;
    }
    const chains = Array.isArray(wallet.chains)
      ? wallet.chains.filter(
          (chain): chain is LinkedWallet["chains"][number] => typeof chain === "string"
        )
      : [];
    const key = `${provider}:${address.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, {
        provider,
        address,
        chains,
      });
    }
  });
  return Array.from(seen.values());
}

async function requestProfile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    console.error("Failed to fetch remote profile", error);
    return null;
  }
}

export async function fetchProfileFromServer(sessionId: string): Promise<StoredProfile | null> {
  const payload = await requestProfile(`${buildApiBase()}/status/${sessionId}`);
  if (!payload) {
    return null;
  }

  const smartAccountAddress =
    typeof payload.smartAccountAddress === "string" ? payload.smartAccountAddress : undefined;
  const loginType = payload.loginType as LoginType | undefined;
  if (!smartAccountAddress || !loginType) {
    return null;
  }

  const ownerAddress = typeof payload.ownerAddress === "string" ? payload.ownerAddress : undefined;
  const paymasterPolicyId =
    typeof payload.paymasterPolicyId === "string" ? payload.paymasterPolicyId : undefined;
  const linkedWallets = normaliseLinkedWallets(
    Array.isArray(payload.linkedWallets)
      ? (payload.linkedWallets as Array<Record<string, unknown>>)
      : []
  );

  const sponsorshipPlan =
    ((payload.sponsorshipPlan ?? payload.plan) as SponsorshipPlanId | undefined) ?? "starter";

  const socialLogins = Array.isArray(payload.socialLogins)
    ? (payload.socialLogins as Array<SocialProvider>).filter(
        (value): value is SocialProvider => value === "google" || value === "apple"
      )
    : undefined;

  const profile: StoredProfile = {
    sessionId,
    smartAccountAddress,
    ownerAddress,
    loginType,
    paymasterPolicyId,
    linkedWallets,
    sponsorshipPlan,
    socialLogins,
  };

  writeProfile(profile);
  if (linkedWallets.length > 0) {
    queueAutoConnectWallets(linkedWallets);
  }
  markProfileAcknowledged();

  return profile;
}

export async function syncProfileWithServer(): Promise<StoredProfile | null> {
  const local = readProfile();
  if (!local?.sessionId) {
    return null;
  }
  const remote = await fetchProfileFromServer(local.sessionId);
  return remote ?? local;
}
