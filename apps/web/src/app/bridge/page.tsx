import type { Metadata } from "next";
import { BridgeFlow } from "@/components/bridge/BridgeFlow";

export const metadata: Metadata = {
  title: "Monolith · Bridge",
  description: "Move USDC and MON between Ethereum, Arbitrum, Solana, and Monad.",
};

export default function BridgePage() {
  return <BridgeFlow />;
}
