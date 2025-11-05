import type {
  BalanceIntent,
  BridgeSubmission,
  QuoteResponse,
  SupportedChain,
  SupportedToken,
  WalletProvider,
} from "./types";

type FetchBalancesResponse = {
  provider: WalletProvider;
  address: string;
  chainConnections: SupportedChain[];
  intents: BalanceIntent[];
};

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

const tokenDecimals: Record<SupportedToken, number> = {
  usdc: 6,
  usdt: 6,
  mon: 18,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatAmount = (amount: number, token: SupportedToken) => {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: tokenDecimals[token] > 8 ? 4 : 2,
    maximumFractionDigits: tokenDecimals[token] > 8 ? 6 : 4,
  })} ${token.toUpperCase()}`;
};

type BaseIntent = Omit<BalanceIntent, "id" | "availableFormatted" | "provider"> & {
  id: string;
};

const BASE_INTENTS: Record<WalletProvider, BaseIntent[]> = {
  metamask: [
    {
      id: "eth_usdc_mon",
      sourceChain: "ethereum",
      sourceToken: "usdc",
      destinationChain: "monad",
      destinationToken: "mon",
      availableAmount: 1250.52,
      usdValue: 1250.52,
      feeBps: 12,
      etaMinutes: 7,
    },
    {
      id: "arb_usdc_mon",
      sourceChain: "arbitrum",
      sourceToken: "usdc",
      destinationChain: "monad",
      destinationToken: "mon",
      availableAmount: 483.1,
      usdValue: 483.1,
      feeBps: 8,
      etaMinutes: 4,
    },
    {
      id: "mon_mon_usdc_eth",
      sourceChain: "monad",
      sourceToken: "mon",
      destinationChain: "ethereum",
      destinationToken: "usdc",
      availableAmount: 1500,
      usdValue: 1500,
      feeBps: 18,
      etaMinutes: 9,
    },
  ],
  phantom: [
    {
      id: "sol_usdc_mon",
      sourceChain: "solana",
      sourceToken: "usdc",
      destinationChain: "monad",
      destinationToken: "mon",
      availableAmount: 920.75,
      usdValue: 920.75,
      feeBps: 15,
      etaMinutes: 6,
    },
    {
      id: "mon_mon_usdc_sol",
      sourceChain: "monad",
      sourceToken: "mon",
      destinationChain: "solana",
      destinationToken: "usdc",
      availableAmount: 640,
      usdValue: 640,
      feeBps: 20,
      etaMinutes: 8,
    },
  ],
  backpack: [
    {
      id: "sol_usdc_mon_backpack",
      sourceChain: "solana",
      sourceToken: "usdc",
      destinationChain: "monad",
      destinationToken: "mon",
      availableAmount: 412.34,
      usdValue: 412.34,
      feeBps: 14,
      etaMinutes: 5,
    },
    {
      id: "mon_mon_usdc_sol_backpack",
      sourceChain: "monad",
      sourceToken: "mon",
      destinationChain: "solana",
      destinationToken: "usdc",
      availableAmount: 860.12,
      usdValue: 860.12,
      feeBps: 19,
      etaMinutes: 8,
    },
  ],
};

const PROVIDER_CHAINS: Record<WalletProvider, SupportedChain[]> = {
  metamask: ["ethereum", "arbitrum"],
  phantom: ["solana"],
  backpack: ["solana"],
};

const buildIntent = (provider: WalletProvider, base: BaseIntent): BalanceIntent => ({
  ...base,
  id: `${provider}:${base.id}`,
  availableFormatted: formatAmount(base.availableAmount, base.sourceToken),
  provider,
});

const getBaseIntent = (intentId: string): { provider: WalletProvider; intent: BaseIntent } => {
  const [providerKey, rawId] = intentId.split(":") as [WalletProvider, string];
  const intents = BASE_INTENTS[providerKey];
  if (!intents) {
    throw new Error("Unknown provider");
  }
  const intent = intents.find((item) => item.id === rawId);
  if (!intent) {
    throw new Error("Intent not found");
  }
  return { provider: providerKey, intent };
};

export async function fetchBalances(
  provider: WalletProvider,
  address: string,
  chains?: SupportedChain[]
): Promise<FetchBalancesResponse> {
  await sleep(320);
  const intents = BASE_INTENTS[provider].map((intent) => buildIntent(provider, intent));

  return {
    provider,
    address,
    chainConnections: chains ?? PROVIDER_CHAINS[provider],
    intents,
  };
}

export async function fetchQuote(intentId: string, amount: number): Promise<QuoteResponse> {
  await sleep(260);
  const { provider, intent } = getBaseIntent(intentId);
  const baseIntent = buildIntent(provider, intent);

  const cappedAmount = Math.min(amount, baseIntent.availableAmount);
  const fee = (baseIntent.feeBps / 10000) * cappedAmount;
  const rate = baseIntent.destinationToken === "mon" ? 1 / 1.02 : 1;
  const destinationAmount = (cappedAmount - fee) * rate;

  return {
    intentId: baseIntent.id,
    sourceAmount: cappedAmount,
    destinationAmount,
    feeAmount: fee,
    feeCurrency: baseIntent.sourceToken,
    rate,
    expiresAt: Date.now() + 60_000,
  };
}

export async function submitBridge(intentId: string, amount: number): Promise<BridgeSubmission> {
  await sleep(520);
  const { provider, intent } = getBaseIntent(intentId);
  const baseIntent = buildIntent(provider, intent);

  const sanitizedAmount = Math.max(0, Math.min(amount, baseIntent.availableAmount));
  const status =
    sanitizedAmount <= baseIntent.availableAmount * 0.1
      ? ("awaiting_source" as const)
      : ("pending_settlement" as const);
  const txHash =
    provider === "phantom" || provider === "backpack"
      ? `5${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`
      : `0x${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;

  return {
    intentId: baseIntent.id,
    txHash,
    status,
  };
}

export const chainLabel = (chain: SupportedChain) => chainDisplayName[chain] ?? chain;

export const providerLabel = (provider: WalletProvider) =>
  providerDisplayName[provider] ?? provider;
