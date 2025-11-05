import {
  fetchBalances as mockFetchBalances,
  fetchQuote as mockFetchQuote,
  submitBridge as mockSubmitBridge,
  chainLabel as mockChainLabel,
  providerLabel as mockProviderLabel,
} from "./mockBridgeClient";
import type {
  BalanceIntent,
  BridgeSubmission,
  QuoteResponse,
  SupportedChain,
  SupportedToken,
  WalletProvider,
} from "./types";

const USE_MOCK = (process.env.NEXT_PUBLIC_ENABLE_MOCK_BALANCES ?? "true").toLowerCase() !== "false";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

interface ProviderBalancesResponse {
  provider: WalletProvider;
  address: string;
  chainConnections: SupportedChain[];
  intents: BalanceIntent[];
}

interface SubmitBridgeApiResponse {
  intentId: string;
  txHash: string;
  status: BridgeSubmission["status"];
  provider: WalletProvider;
  sourceChain: SupportedChain;
  destinationChain: SupportedChain;
  sourceToken: SupportedToken;
  destinationToken: SupportedToken;
}

async function requestApi<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message ?? `API call to ${path} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function safeReadError(response: Response): Promise<string | undefined> {
  try {
    const payload = await response.json();
    if (typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
    // ignore parse errors
  }
  return undefined;
}

export async function fetchBalances(
  provider: WalletProvider,
  address: string,
  chains?: SupportedChain[]
): Promise<ProviderBalancesResponse> {
  if (USE_MOCK) {
    return mockFetchBalances(provider, address, chains);
  }

  const body = JSON.stringify({
    address,
    chainConnections: chains && chains.length > 0 ? chains : undefined,
  });

  return requestApi<ProviderBalancesResponse>(`/bridge/providers/${provider}/balances`, {
    method: "POST",
    body,
  });
}

export async function fetchQuote(intentId: string, amount: number): Promise<QuoteResponse> {
  if (USE_MOCK) {
    return mockFetchQuote(intentId, amount);
  }

  const body = JSON.stringify({ intentId, amount });

  return requestApi<QuoteResponse>("/bridge/quote", {
    method: "POST",
    body,
  });
}

export async function submitBridge(intentId: string, amount: number): Promise<BridgeSubmission> {
  if (USE_MOCK) {
    return mockSubmitBridge(intentId, amount);
  }

  const body = JSON.stringify({ intentId, amount });

  const result = await requestApi<SubmitBridgeApiResponse>("/bridge/submit", {
    method: "POST",
    body,
  });

  return {
    intentId: result.intentId,
    txHash: result.txHash,
    status: result.status,
  };
}

export const chainLabel = mockChainLabel;
export const providerLabel = mockProviderLabel;
