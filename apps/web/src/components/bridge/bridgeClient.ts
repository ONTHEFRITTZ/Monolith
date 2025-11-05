import type {
  BalanceIntent,
  BridgeSubmission,
  QuoteResponse,
  SupportedChain,
  SupportedToken,
  WalletProvider,
} from "./types";

const RAW_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const API_BASE_URL = RAW_API_BASE.replace(/\/$/, "");
const API_ROOT = `${API_BASE_URL}/api`;

const chainDisplayName: Record<SupportedChain, string> = {
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  solana: "Solana",
  monad: "Monad",
};

const providerDisplayName: Record<WalletProvider, string> = {
  metamask: "MetaMask",
  phantom: "Phantom",
  backpack: "Backpack",
};

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
  const response = await fetch(`${API_ROOT}${path}`, {
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
  const body = JSON.stringify({ intentId, amount });

  return requestApi<QuoteResponse>("/bridge/quote", {
    method: "POST",
    body,
  });
}

export async function submitBridge(intentId: string, amount: number): Promise<BridgeSubmission> {
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

export const chainLabel = (chain: SupportedChain): string => chainDisplayName[chain] ?? chain;

export const providerLabel = (provider: WalletProvider): string =>
  providerDisplayName[provider] ?? provider;
