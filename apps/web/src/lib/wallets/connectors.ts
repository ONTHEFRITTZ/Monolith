import MetaMaskSDK from "@metamask/sdk";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import type { SupportedChain, WalletProvider } from "@/components/bridge/types";

export interface WalletConnectionResult {
  address: string;
  chains: SupportedChain[];
}

export interface WalletConnector {
  provider: WalletProvider;
  connect(): Promise<WalletConnectionResult>;
  disconnect(): Promise<void>;
}

const metamaskSdk =
  typeof window !== "undefined"
    ? new MetaMaskSDK({
        dappMetadata: {
          name: "Mon-olith Bridge",
        },
        logging: {
          developerMode: false,
        },
      })
    : null;

const phantomAdapter = typeof window !== "undefined" ? new PhantomWalletAdapter() : null;

const backpackAdapter = typeof window !== "undefined" ? new BackpackWalletAdapter() : null;

export const metamaskConnector: WalletConnector = {
  provider: "metamask",
  async connect() {
    if (!metamaskSdk) {
      throw new Error("MetaMask SDK unavailable in this environment.");
    }
    const ethereum = metamaskSdk.getProvider();
    if (!ethereum) {
      throw new Error("MetaMask provider not found. Install MetaMask extension.");
    }
    const accounts: string[] = await ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) {
      throw new Error("No MetaMask accounts returned.");
    }

    const chainId: string = await ethereum.request({ method: "eth_chainId" });
    const chains = mapEvmChain(chainId);

    return {
      address: accounts[0],
      chains,
    };
  },
  async disconnect() {
    if (!metamaskSdk) {
      return;
    }
    await metamaskSdk.disconnect();
  },
};

export const phantomConnector: WalletConnector = {
  provider: "phantom",
  async connect() {
    if (!phantomAdapter) {
      throw new Error("Phantom adapter unavailable.");
    }
    if (!phantomAdapter.connected) {
      await phantomAdapter.connect();
    }
    if (!phantomAdapter.publicKey) {
      throw new Error("Phantom public key missing.");
    }
    return {
      address: phantomAdapter.publicKey.toBase58(),
      chains: ["solana"],
    };
  },
  async disconnect() {
    if (phantomAdapter?.connected) {
      await phantomAdapter.disconnect();
    }
  },
};

export const backpackConnector: WalletConnector = {
  provider: "backpack",
  async connect() {
    if (!backpackAdapter) {
      throw new Error("Backpack adapter unavailable.");
    }
    if (!backpackAdapter.connected) {
      await backpackAdapter.connect();
    }
    if (!backpackAdapter.publicKey) {
      throw new Error("Backpack public key missing.");
    }
    return {
      address: backpackAdapter.publicKey.toBase58(),
      chains: ["solana"],
    };
  },
  async disconnect() {
    if (backpackAdapter?.connected) {
      await backpackAdapter.disconnect();
    }
  },
};

export function getConnector(provider: WalletProvider): WalletConnector {
  switch (provider) {
    case "metamask":
      return metamaskConnector;
    case "phantom":
      return phantomConnector;
    case "backpack":
      return backpackConnector;
    default:
      throw new Error(`Unsupported provider ${provider}`);
  }
}

function mapEvmChain(chainId: string): SupportedChain[] {
  switch (chainId.toLowerCase()) {
    case "0x1":
      return ["ethereum"];
    case "0xa4b1":
      return ["arbitrum"];
    default:
      return ["ethereum"];
  }
}
