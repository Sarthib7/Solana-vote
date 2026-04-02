"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AddressType, BrowserSDK } from "@phantom/browser-sdk";
import { toast } from "sonner";

let phantomSdk: BrowserSDK | null = null;

function getPhantomSdk() {
  if (!phantomSdk) {
    phantomSdk = new BrowserSDK({
      providers: ["injected"],
      addressTypes: [AddressType.solana],
    });
  }

  return phantomSdk;
}

export function PhantomDevnetGuard() {
  const { connected, publicKey, wallet } = useWallet();
  const attemptedForWallet = useRef<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      attemptedForWallet.current = null;
      return;
    }

    if (wallet?.adapter.name !== "Phantom") {
      return;
    }

    const publicKeyBase58 = publicKey.toBase58();
    if (attemptedForWallet.current === publicKeyBase58) {
      return;
    }

    attemptedForWallet.current = publicKeyBase58;
    let cancelled = false;

    void (async () => {
      try {
        const sdk = getPhantomSdk();

        if (!sdk.isConnected()) {
          await sdk.connect({ provider: "injected" });
        }

        await sdk.solana.switchNetwork("devnet");
      } catch (error) {
        console.error("Unable to switch Phantom to devnet", error);

        if (!cancelled) {
          toast.error(
            "Approve the Phantom prompt to switch this wallet to devnet before using the app."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, wallet]);

  return null;
}
