"use client";

import { useCallback, useMemo, useState } from "react";
import { fetchBalances, fetchQuote, submitBridge } from "./mockBridgeClient";
import type { BalanceIntent, BridgeActions, BridgeState } from "./types";

const defaultState: BridgeState = {
  isConnected: false,
  chainConnections: [],
  intents: [],
  isLoading: false,
};

export function useBridgeState(): { state: BridgeState; actions: BridgeActions } {
  const [state, setState] = useState<BridgeState>(defaultState);

  const connectWallet = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: undefined }));
      const response = await fetchBalances();
      setState((prev) => ({
        ...prev,
        isConnected: true,
        primaryAddress: response.primaryAddress,
        chainConnections: response.chainConnections,
        intents: response.intents,
        isLoading: false,
        error: undefined,
      }));
    } catch (error) {
      console.error(error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Unable to connect wallet. Please retry.",
      }));
    }
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!state.isConnected) {
      return;
    }
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: undefined }));
      const response = await fetchBalances();
      setState((prev) => ({
        ...prev,
        intents: response.intents,
        chainConnections: response.chainConnections,
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
  }, [state.isConnected]);

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

  const disconnect = useCallback(() => {
    setState(defaultState);
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
      connectWallet,
      disconnect,
      refreshBalances,
      selectIntent,
      requestQuote,
      submitBridge: handleSubmit,
      resetSubmission,
      clearError,
    }),
    [
      clearError,
      connectWallet,
      disconnect,
      handleSubmit,
      refreshBalances,
      requestQuote,
      resetSubmission,
      selectIntent,
    ]
  );

  return { state, actions };
}
