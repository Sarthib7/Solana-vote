"use client";

const PHANTOM_TESTNET_MODE_URL =
  "https://docs.phantom.com/developer-powertools/testnet-mode";

type DevnetNoticeProps = {
  compact?: boolean;
};

export function DevnetNotice({ compact = false }: DevnetNoticeProps) {
  return (
    <div
      className={
        compact
          ? "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          : "rounded-[1.75rem] border border-amber-200 bg-amber-50/95 p-5 text-sm text-amber-950 shadow-[0_18px_45px_rgba(146,64,14,0.08)]"
      }
    >
      <p className="font-semibold uppercase tracking-[0.16em] text-amber-700">
        Devnet Only
      </p>
      <p className="mt-2 leading-6">
        This app is locked to Solana devnet. Mainnet is not supported. Phantom,
        Backpack, Solflare, and other Solana wallets can connect, but the wallet
        itself must be on devnet. In Phantom, open{" "}
        <span className="font-semibold">Settings → Developer Settings → Testnet Mode</span>{" "}
        before creating a session or voting.
      </p>
      <a
        href={PHANTOM_TESTNET_MODE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex text-sm font-semibold text-amber-800 underline underline-offset-4"
      >
        Phantom testnet mode docs
      </a>
    </div>
  );
}
