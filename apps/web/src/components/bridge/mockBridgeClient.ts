import type { BalanceIntent, QuoteResponse, SupportedChain, SupportedToken } from "./types";

type FetchBalancesResponse = {
  primaryAddress: string;
  chainConnections: SupportedChain[];
  intents: BalanceIntent[];
};

const chainDisplayName: Record<SupportedChain, string> = {
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  solana: "Solana",
  monad: "Monad",
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

const MOCK_INTENTS: BalanceIntent[] = [
  {
    id: "intent_eth_usdc_mon",
    sourceChain: "ethereum",
    sourceToken: "usdc",
    destinationChain: "monad",
    destinationToken: "mon",
    availableAmount: 1250.52,
    availableFormatted: formatAmount(1250.52, "usdc"),
    usdValue: 1250.52,
    feeBps: 12,
    etaMinutes: 7,
  },
  {
    id: "intent_arb_usdc_mon",
    sourceChain: "arbitrum",
    sourceToken: "usdc",
    destinationChain: "monad",
    destinationToken: "mon",
    availableAmount: 483.1,
    availableFormatted: formatAmount(483.1, "usdc"),
    usdValue: 483.1,
    feeBps: 8,
    etaMinutes: 4,
  },
  {
    id: "intent_sol_usdc_mon",
    sourceChain: "solana",
    sourceToken: "usdc",
    destinationChain: "monad",
    destinationToken: "mon",
    availableAmount: 920.75,
    availableFormatted: formatAmount(920.75, "usdc"),
    usdValue: 920.75,
    feeBps: 15,
    etaMinutes: 6,
  },
  {
    id: "intent_mon_mon_usdc_eth",
    sourceChain: "monad",
    sourceToken: "mon",
    destinationChain: "ethereum",
    destinationToken: "usdc",
    availableAmount: 1500,
    availableFormatted: formatAmount(1500, "mon"),
    usdValue: 1500,
    feeBps: 18,
    etaMinutes: 9,
  },
];

export async function fetchBalances(): Promise<FetchBalancesResponse> {
  await sleep(350);

  return {
    primaryAddress: "0x1284...9af3",
    chainConnections: ["ethereum", "arbitrum", "solana"],
    intents: MOCK_INTENTS,
  };
}

export async function fetchQuote(intentId: string, amount: number): Promise<QuoteResponse> {
  await sleep(280);
  const intent = MOCK_INTENTS.find((item) => item.id === intentId);
  if (!intent) {
    throw new Error("Intent not found");
  }

  const cappedAmount = Math.min(amount, intent.availableAmount);
  const fee = (intent.feeBps / 10000) * cappedAmount;
  const rate = intent.destinationToken === "mon" ? 1 / 1.02 : 1;
  const destinationAmount = (cappedAmount - fee) * rate;

  return {
    intentId,
    sourceAmount: cappedAmount,
    destinationAmount,
    feeAmount: fee,
    feeCurrency: intent.sourceToken,
    rate,
    expiresAt: Date.now() + 60_000,
  };
}

export async function submitBridge(intentId: string, amount: number) {
  await sleep(600);
  const intent = MOCK_INTENTS.find((item) => item.id === intentId);
  if (!intent) {
    throw new Error("Intent not found");
  }

  const sanitizedAmount = Math.max(0, Math.min(amount, intent.availableAmount));
  const status =
    sanitizedAmount <= intent.availableAmount * 0.1
      ? ("awaiting_source" as const)
      : ("pending_settlement" as const);
  const nextStatus: QuoteResponse["intentId"] = intentId;
  const txHash = `0x${Math.random().toString(16).slice(2, 10)}${Math.random()
    .toString(16)
    .slice(2, 10)}`;

  return {
    intentId: nextStatus,
    txHash,
    status,
  };
}

export const chainLabel = (chain: SupportedChain) => chainDisplayName[chain] ?? chain;
