"use client";

import { ThemeProvider } from "next-themes";
import { toast, Toaster } from "sonner";
import { PropsWithChildren, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  type Adapter,
  type WalletError,
  WalletAdapterNetwork,
} from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { PhantomDevnetGuard } from "./phantom-devnet-guard";

import "@solana/wallet-adapter-react-ui/styles.css";

const DEVNET_ENDPOINT = "https://api.devnet.solana.com";

export function Providers({ children }: PropsWithChildren) {
  const endpoint = useMemo(() => DEVNET_ENDPOINT, []);
  const network = WalletAdapterNetwork.Devnet;

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })],
    [network]
  );
  const handleWalletError = (error: WalletError, adapter?: Adapter) => {
    console.error("Wallet error", { adapter: adapter?.name, error });
    toast.error(error.message || "Wallet interaction failed.");
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect onError={handleWalletError}>
          <WalletModalProvider>
            <PhantomDevnetGuard />
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
