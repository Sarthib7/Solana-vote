"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { DevnetNotice } from "./components/devnet-notice";
import { extractSessionLookup } from "./lib/session-links";

const productHighlights = [
  "Create a wallet-owned session on devnet.",
  "Share one invite link, QR code, or short join code with everyone in the room.",
  "Publish live questions with 2 to 6 voting options and watch results update across clients.",
];

export default function HomePage() {
  const router = useRouter();
  const [sessionInput, setSessionInput] = useState("");

  const trimmedSessionInput = useMemo(() => sessionInput.trim(), [sessionInput]);

  const handleJoin = () => {
    const lookup = extractSessionLookup(trimmedSessionInput);
    if (!lookup) {
      toast.error("Paste a join link, join code, or legacy session address first.");
      return;
    }

    if (lookup.joinCode) {
      router.push(`/join?code=${encodeURIComponent(lookup.joinCode)}`);
      return;
    }

    router.push(`/join?session=${encodeURIComponent(lookup.sessionAddress!)}`);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.16),transparent_28%),linear-gradient(180deg,#fffdf7_0%,#eef6ff_100%)] text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
            SolanaVote
          </p>
          <h1 className="text-lg font-semibold text-slate-900">
            Wallet-owned live session voting
          </h1>
        </div>
        <WalletMultiButton />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-6 sm:px-6 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <section className="rounded-[2rem] border border-white/70 bg-white/85 p-7 shadow-[0_30px_100px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mb-8 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Production-minded MVP
          </div>
          <div className="max-w-2xl space-y-4">
            <h2 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Run a live quiz or vote from your wallet, not from a hidden admin panel.
            </h2>
            <p className="max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Anyone can create a session, publish live proposals, and share one
              join flow. Participants scan a QR code or enter a join code, connect a
              wallet, and watch the dashboard move in real time.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {productHighlights.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm font-medium leading-6 text-slate-700"
              >
                {item}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/creator"
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Create a Session
            </Link>
            <Link
              href="/join"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
            >
              Open Join Screen
            </Link>
          </div>

          <div className="mt-8">
            <DevnetNotice compact />
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white/92 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
            <div className="mb-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">
                Join a Session
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                Paste a shared link or enter a join code
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Joiners are routed to the live ballot view, and the screen follows
                the current vote automatically as the creator publishes new prompts.
              </p>
            </div>

            <div className="space-y-3">
              <textarea
                value={sessionInput}
                onChange={(event) => setSessionInput(event.target.value)}
                placeholder="https://your-app/join?code=ABCD12, ABCD12, or a legacy session address"
                className="min-h-28 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white"
              />
              <button
                onClick={handleJoin}
                className="inline-flex w-full items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Join Session
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_20px_70px_rgba(15,23,42,0.18)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-300">
              Session Flow
            </p>
            <div className="mt-4 space-y-4 text-sm leading-6 text-slate-300">
              <p>
                <span className="font-semibold text-white">1.</span> Connect a wallet
                and create a session with a title and short join code.
              </p>
              <p>
                <span className="font-semibold text-white">2.</span> Share the invite
                link or let people scan the QR code in the room.
              </p>
              <p>
                <span className="font-semibold text-white">3.</span> Publish a live
                question with your own answer options and watch every screen stay in sync.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
