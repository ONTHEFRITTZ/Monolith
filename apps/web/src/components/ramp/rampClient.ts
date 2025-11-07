type FetchError = Error & { status?: number };

function resolveApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" && window.location.port === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:3001`;
    }
    return window.location.origin;
  }
  return "http://localhost:3001";
}

const API_BASE_URL = resolveApiBase().replace(/\/$/, "");
const API_ROOT = `${API_BASE_URL}/api`;

export type RampProvider = "paypal" | "stripe" | "circle";
export type RampCurrency = "USD" | "CAD" | "EUR";

export interface RampActionResponse {
  requestId: string;
  provider: RampProvider;
  status: "awaiting_settlement" | "scheduled";
  referenceCode: string;
  etaMinutes: number;
  summary: string;
  instructions: string[];
}

interface BaseRampPayload {
  provider: RampProvider;
  amount: number;
  currency: RampCurrency;
  contactEmail?: string;
  accountReference?: string;
  institutionName?: string;
  notes?: string;
  sessionId?: string;
}

export interface OnRampPayload extends BaseRampPayload {
  destinationWallet: string;
}

export interface OffRampPayload extends BaseRampPayload {
  sourceWallet: string;
}

export async function submitOnRamp(payload: OnRampPayload): Promise<RampActionResponse> {
  return requestRamp("/ramp/on", payload);
}

export async function submitOffRamp(payload: OffRampPayload): Promise<RampActionResponse> {
  return requestRamp("/ramp/off", payload);
}

async function requestRamp<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await readError(response);
    const error: FetchError = new Error(
      message ?? `Ramp API call to ${path} failed with status ${response.status}`
    );
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as T;
}

async function readError(response: Response): Promise<string | undefined> {
  try {
    const payload = await response.json();
    if (payload?.message) {
      return Array.isArray(payload.message) ? payload.message.join(", ") : payload.message;
    }
  } catch {
    // ignore
  }
  return undefined;
}
