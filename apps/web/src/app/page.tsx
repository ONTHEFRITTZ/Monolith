"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { getConnector } from "@/lib/wallets/connectors";
import type { WalletProvider } from "@/components/bridge/types";
import { providerLabel } from "@/components/bridge/bridgeClient";
import { ProfilePromptModal } from "@/components/bridge/ProfilePromptModal";
import { markProfileAcknowledged, readProfile, syncProfileWithServer } from "@/lib/profile";

const WALLET_OPTIONS: WalletProvider[] = ["metamask", "phantom", "backpack"];
const WALLET_LOGOS: Record<WalletProvider, string> = {
  metamask: "/logos/metamask.png",
  phantom: "/logos/phantom.png",
  backpack: "/logos/backpack.png",
};

export default function Home() {
  const router = useRouter();
  const [connecting, setConnecting] = useState<WalletProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileExists, setProfileExists] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return Boolean(readProfile());
  });
  const [promptDismissed, setPromptDismissed] = useState(() => profileExists);

  useEffect(() => {
    if (profileExists) {
      router.replace("/bridge");
    }
  }, [profileExists, router]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const profile = await syncProfileWithServer();
      if (!cancelled && profile) {
        setProfileExists(true);
        setPromptDismissed(true);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const promptOpen = !profileExists && !promptDismissed;

  const handleGuestContinue = () => {
    markProfileAcknowledged();
    setPromptDismissed(true);
    router.push("/bridge");
  };

  const handleConnect = async (provider: WalletProvider) => {
    setError(null);
    setConnecting(provider);
    try {
      const connector = getConnector(provider);
      await connector.connect();
      router.push("/bridge");
    } catch (err) {
      console.error(err);
      setError("Unable to connect. Check your wallet and try again.");
      setConnecting(null);
    }
  };

  return (
    <div className={styles.page}>
      <ProfilePromptModal
        open={promptOpen}
        onDismiss={() => setPromptDismissed(true)}
        onContinueGuest={handleGuestContinue}
      />

      <main className={styles.container}>
        <div>
          <h1 className={styles.title}>Connect your wallet</h1>
          <p className={styles.subtitle}>Choose a provider to start bridging on Monad.</p>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.walletGrid}>
          {WALLET_OPTIONS.map((provider) => (
            <button
              key={provider}
              type="button"
              className={styles.walletButton}
              onClick={() => void handleConnect(provider)}
              disabled={connecting !== null}
            >
              <span className={styles.walletImage}>
                <Image
                  src={WALLET_LOGOS[provider]}
                  alt={`${providerLabel(provider)} logo`}
                  fill
                  sizes="72px"
                />
              </span>
              <span className={styles.walletLabel}>
                {connecting === provider ? "Connecting..." : providerLabel(provider)}
              </span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
