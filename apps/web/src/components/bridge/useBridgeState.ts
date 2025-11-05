"use client";

import { useCallback, useMemo, useState } from "react";
import { fetchBalances, fetchQuote, submitBridge } from "./mockBridgeClient";
import type {
  BalanceIntent,
  BridgeActions,
  BridgeState,
  SupportedChain,
  WalletConnection,
  WalletProvider,
} from "./types";
import { getConnector } from "@/lib/wallets/connectors";

const defaultState: BridgeState = {
  isConnected: false,
  connectedWallets: [],
  chainConnections: [],
  intents: [],
  isLoading: false,
};

export function useBridgeState(): { state: BridgeState; actions: BridgeActions } {
  const [state, setState] = useState<BridgeState>(defaultState);

  const connectProvider = useCallback(async (provider: WalletProvider) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: undefined }));

      const connector = getConnector(provider);
      const { address, chains } = await connector.connect();
      const response = await fetchBalances(provider, address, chains);

      setState((prev) => ({
        ...prev,
        isConnected: true,
        connectedWallets: mergeWalletConnections(prev.connectedWallets, {
          provider,
          address: response.address,
          chains: response.chainConnections,
        }),
        chainConnections: unionChains(prev.chainConnections, response.chainConnections),
        intents: mergeIntents(prev.intents, response.intents, provider),
        isLoading: false,
        error: undefined,
      }));
    } catch (error) {
      console.error(error);
      try {
        await getConnector(provider).disconnect();
      } catch {
        // ignore disconnect errors
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Unable to connect wallet. Please retry.",
      }));
    }
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!state.isConnected || state.connectedWallets.length === 0) {
      return;
    }

    try {
      setState((prev) => ({ ...prev, isLoading: true, error: undefined }));

      const responses = await Promise.all(
        state.connectedWallets.map((wallet) =>
          fetchBalances(wallet.provider, wallet.address, wallet.chains)
        )
      );

      const nextWallets: WalletConnection[] = responses.map((response) => ({
        provider: response.provider,
        address: response.address,
        chains: response.chainConnections,
      }));

      const nextIntents = responses.flatMap((response) => response.intents);
      const nextChains = responses
        .map((response) => response.chainConnections)
        .reduce<Set<SupportedChain>>((acc, chains) => {
          chains.forEach((chain) => acc.add(chain));
          return acc;
        }, new Set<SupportedChain>());

      setState((prev) => ({
        ...prev,
        connectedWallets: nextWallets,
        intents: nextIntents,
        chainConnections: Array.from(nextChains),
        isLoading: false,
        error: undefined,
      }));
    } catch (error) {
      console.error(error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Failed to refresh balances.",
      }));
    }
  }, [state.connectedWallets, state.isConnected]);

  const selectIntent = useCallback((intent: BalanceIntent | undefined) => {
    setState((prev) => ({
      ...prev,
      selectedIntent: intent,
      quote: undefined,
      submission: undefined,
      error: undefined,
    }));
  }, []);

  const requestQuote = useCallback(async (intentId: string, amount: number) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: undefined }));
      const quote = await fetchQuote(intentId, amount);
      setState((prev) => ({
        ...prev,
        quote,
        isLoading: false,
      }));
    } catch (error) {
      console.error(error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Quote request failed. Try a different amount.",
      }));
    }
  }, []);

  const handleSubmit = useCallback(async (intentId: string, amount: number) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: undefined }));
      const submission = await submitBridge(intentId, amount);
      setState((prev) => ({
        ...prev,
        submission: {
          txHash: submission.txHash,
          status: submission.status,
        },
        isLoading: false,
      }));
    } catch (error) {
      console.error(error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Bridge submission failed. Please retry.",
      }));
    }
  }, []);

  const disconnectAll = useCallback(async () => {
    await Promise.all(
      state.connectedWallets.map((wallet) => {
        const connector = getConnector(wallet.provider);
        return connector.disconnect();
      })
    );
    setState(defaultState);
  }, [state.connectedWallets]);

  const removeProvider = useCallback(async (provider: WalletProvider) => {
    try {
      await getConnector(provider).disconnect();
    } catch (error) {
      console.error(error);
    }

    setState((prev) => {
      const remainingWallets = prev.connectedWallets.filter(
        (wallet) => wallet.provider !== provider
      );
      const remainingIntents = prev.intents.filter((intent) => intent.provider !== provider);
      const remainingChains = Array.from(
        new Set(remainingWallets.flatMap((wallet) => wallet.chains))
      ) as SupportedChain[];
      const nextSelected =
        prev.selectedIntent && prev.selectedIntent.provider === provider
          ? undefined
          : prev.selectedIntent;

      return {
        ...prev,
        connectedWallets: remainingWallets,
        chainConnections: remainingChains,
        intents: remainingIntents,
        selectedIntent: nextSelected,
        quote: nextSelected ? prev.quote : undefined,
        submission: nextSelected ? prev.submission : undefined,
        isConnected: remainingWallets.length > 0,
      };
    });
  }, []);

  const resetSubmission = useCallback(() => {
    setState((prev) => ({
      ...prev,
      submission: undefined,
      quote: undefined,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: undefined }));
  }, []);

  const actions = useMemo<BridgeActions>(
    () => ({
      connectProvider,
      disconnectAll,
      removeProvider,
      refreshBalances,
      selectIntent,
      requestQuote,
      submitBridge: handleSubmit,
      resetSubmission,
      clearError,
    }),
    [
      clearError,
      connectProvider,
      disconnectAll,
      handleSubmit,
      refreshBalances,
      removeProvider,
      requestQuote,
      resetSubmission,
      selectIntent,
    ]
  );

  return { state, actions };
}

function mergeWalletConnections(
  existing: WalletConnection[],
  incoming: WalletConnection
): WalletConnection[] {
  const filtered = existing.filter((wallet) => wallet.provider !== incoming.provider);
  return [...filtered, incoming];
}

function mergeIntents(
  existing: BalanceIntent[],
  incoming: BalanceIntent[],
  provider: WalletProvider
): BalanceIntent[] {
  const filtered = existing.filter((intent) => intent.provider !== provider);
  return [...filtered, ...incoming];
}

function unionChains(existing: SupportedChain[], incoming: SupportedChain[]): SupportedChain[] {
  const set = new Set<SupportedChain>([...existing, ...incoming]);
  return Array.from(set);
}
