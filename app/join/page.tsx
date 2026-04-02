"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { DevnetNotice } from "../components/devnet-notice";
import {
  SessionAccount,
  VotingRoundAccount,
  useSolanaVote,
} from "../lib/hooks/useSolanaVote";
import { ellipsify, getExplorerUrl } from "../lib/explorer";
import { buildJoinUrl, extractSessionLookup } from "../lib/session-links";
import { getSessionStateLabel } from "../lib/session-state";

type JoinOptionSummary = {
  index: number;
  label: string;
  count: number;
  percentage: number;
  buttonClass: string;
  labelClass: string;
  barClass: string;
};

const OPTION_UI = [
  {
    buttonClass: "border-sky-300 bg-sky-50 hover:border-sky-500 hover:bg-white",
    labelClass: "text-sky-700",
    barClass: "bg-sky-500",
  },
  {
    buttonClass:
      "border-orange-300 bg-orange-50 hover:border-orange-500 hover:bg-white",
    labelClass: "text-orange-700",
    barClass: "bg-orange-500",
  },
  {
    buttonClass:
      "border-emerald-300 bg-emerald-50 hover:border-emerald-500 hover:bg-white",
    labelClass: "text-emerald-700",
    barClass: "bg-emerald-500",
  },
  {
    buttonClass:
      "border-fuchsia-300 bg-fuchsia-50 hover:border-fuchsia-500 hover:bg-white",
    labelClass: "text-fuchsia-700",
    barClass: "bg-fuchsia-500",
  },
  {
    buttonClass: "border-amber-300 bg-amber-50 hover:border-amber-500 hover:bg-white",
    labelClass: "text-amber-700",
    barClass: "bg-amber-500",
  },
  {
    buttonClass:
      "border-indigo-300 bg-indigo-50 hover:border-indigo-500 hover:bg-white",
    labelClass: "text-indigo-700",
    barClass: "bg-indigo-500",
  },
];

function getTotalVotes(round: VotingRoundAccount | null) {
  if (!round) return 0;
  return round.optionCounts.reduce((sum, count) => sum + count.toNumber(), 0);
}

function getRoundOptions(round: VotingRoundAccount | null): JoinOptionSummary[] {
  if (!round) return [];

  const totalVotes = getTotalVotes(round);

  return round.optionLabels.map((label, index) => {
    const count = round.optionCounts[index]?.toNumber() ?? 0;
    const ui = OPTION_UI[index % OPTION_UI.length];

    return {
      index,
      label,
      count,
      percentage: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
      buttonClass: ui.buttonClass,
      labelClass: ui.labelClass,
      barClass: ui.barClass,
    };
  });
}

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey, connected } = useWallet();
  const {
    castVote,
    fetchLatestRound,
    fetchSession,
    fetchVoteRecord,
    getSessionPDA,
    subscribeToRound,
    subscribeToSession,
  } = useSolanaVote();

  const codeParam = searchParams.get("code");
  const legacySessionParam = searchParams.get("session");

  const [origin, setOrigin] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [sessionPDA, setSessionPDA] = useState<PublicKey | null>(null);
  const [session, setSession] = useState<SessionAccount | null>(null);
  const [round, setRound] = useState<VotingRoundAccount | null>(null);
  const [roundPDA, setRoundPDA] = useState<PublicKey | null>(null);
  const [roundMessage, setRoundMessage] = useState(
    "Paste a join link, scan a QR code, or enter the join code to load the live ballot."
  );
  const [loadingSession, setLoadingSession] = useState(false);
  const [voting, setVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [myChoice, setMyChoice] = useState<number | null>(null);
  const [lastTx, setLastTx] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const sessionLabel = useMemo(
    () => (session ? getSessionStateLabel(session.sessionState) : "Waiting"),
    [session]
  );
  const totalVotes = useMemo(() => getTotalVotes(round), [round]);
  const roundOptions = useMemo(() => getRoundOptions(round), [round]);
  const joinUrl = useMemo(() => {
    if (!origin || !session) return "";
    return buildJoinUrl(origin, session.joinCode);
  }, [origin, session]);
  const sessionLive = Boolean(session && "active" in session.sessionState);
  const expired = timeLeft !== null && timeLeft <= 0;

  const refreshVoteRecord = useCallback(async () => {
    if (!publicKey || !roundPDA) {
      setHasVoted(false);
      setMyChoice(null);
      return;
    }

    const voteRecord = await fetchVoteRecord(roundPDA, publicKey);
    setHasVoted(Boolean(voteRecord));
    setMyChoice(voteRecord?.choice ?? null);
  }, [fetchVoteRecord, publicKey, roundPDA]);

  const loadSessionView = useCallback(
    async (value: string, silent = false) => {
      const lookup = extractSessionLookup(value);
      if (!lookup) {
        if (!silent) {
          toast.error("Paste a valid join link, join code, or legacy session address.");
        }
        return;
      }

      try {
        setLoadingSession(true);
        const resolvedSessionPDA = lookup.joinCode
          ? getSessionPDA(lookup.joinCode)[0]
          : new PublicKey(lookup.sessionAddress!);
        const sessionData = await fetchSession(resolvedSessionPDA);

        if (!sessionData) {
          throw new Error("Session not found on devnet.");
        }

        setSessionInput(sessionData.joinCode);
        setSessionPDA(resolvedSessionPDA);
        setSession(sessionData);
        setLastTx("");

        const latestRound = await fetchLatestRound(resolvedSessionPDA);
        if (latestRound) {
          setRound(latestRound.round);
          setRoundPDA(latestRound.roundPDA);
          setRoundMessage("");
        } else {
          setRound(null);
          setRoundPDA(null);
          setRoundMessage(
            sessionData.roundCount === 0
              ? "This session is live, but the creator has not published the first question yet."
              : "The current vote could not be loaded."
          );
        }

        router.replace(`/join?code=${encodeURIComponent(sessionData.joinCode)}`);
      } catch (error) {
        setSession(null);
        setSessionPDA(null);
        setRound(null);
        setRoundPDA(null);
        setRoundMessage("Session not found. Check the invite link or code and try again.");

        if (!silent) {
          toast.error(error instanceof Error ? error.message : "Unable to load session.");
        }
      } finally {
        setLoadingSession(false);
      }
    },
    [fetchLatestRound, fetchSession, getSessionPDA, router]
  );

  useEffect(() => {
    const lookupValue = codeParam ?? legacySessionParam;
    if (!lookupValue) return;
    setSessionInput(lookupValue);
    void loadSessionView(lookupValue, true);
  }, [codeParam, legacySessionParam, loadSessionView]);

  useEffect(() => {
    void refreshVoteRecord();
  }, [refreshVoteRecord]);

  useEffect(() => {
    if (!sessionPDA) return;

    return subscribeToSession(sessionPDA, (updatedSession) => {
      setSession(updatedSession);

      void (async () => {
        const latestRound = await fetchLatestRound(sessionPDA);
        if (!latestRound) {
          setRound(null);
          setRoundPDA(null);
          setRoundMessage(
            updatedSession.roundCount === 0
              ? "This session is live, but the creator has not published the first question yet."
              : "The current vote could not be loaded."
          );
          return;
        }

        setRound(latestRound.round);
        setRoundPDA(latestRound.roundPDA);
        setRoundMessage("");
      })();
    });
  }, [fetchLatestRound, sessionPDA, subscribeToSession]);

  useEffect(() => {
    if (!roundPDA) return;
    return subscribeToRound(roundPDA, setRound);
  }, [roundPDA, subscribeToRound]);

  useEffect(() => {
    if (!round || round.durationSeconds.toNumber() === 0) {
      setTimeLeft(null);
      return;
    }

    const deadline = round.startTime.toNumber() + round.durationSeconds.toNumber();
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = deadline - now;
      setTimeLeft(remaining > 0 ? remaining : 0);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [round]);

  const handleVote = async (choice: number) => {
    if (!connected || !publicKey) {
      toast.error("Connect a Phantom wallet with Testnet Mode enabled.");
      return;
    }

    if (!roundPDA || voting) return;

    setVoting(true);
    try {
      const { tx } = await castVote(roundPDA, choice);
      setLastTx(tx);
      setHasVoted(true);
      setMyChoice(choice);
      toast.success("Vote recorded on devnet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("already in use")) {
        toast.error("This wallet already voted on the live prompt.");
      } else {
        toast.error(`Vote failed: ${message}`);
      }
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.14),transparent_24%),linear-gradient(180deg,#fffdf7_0%,#eef6ff_100%)] text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
            Join Session
          </p>
          <h1 className="text-lg font-semibold text-slate-900">
            Scan the QR code, connect a wallet, and vote
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/creator"
            className="hidden rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 sm:inline-flex"
          >
            Creator View
          </Link>
          <WalletMultiButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-4 sm:px-6 lg:grid lg:grid-cols-[0.84fr_1.16fr] lg:items-start">
        <section className="space-y-5">
          <div className="rounded-[2rem] border border-white/70 bg-white/92 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">
              Session Access
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Open the live ballot
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Scan the QR code from the host screen, paste the invite link, or enter
              the short join code directly.
            </p>

            <div className="mt-4 space-y-3">
              <DevnetNotice compact />

              <textarea
                value={sessionInput}
                onChange={(event) => setSessionInput(event.target.value)}
                placeholder="Paste a join link, a short join code, or a legacy session address"
                className="min-h-28 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white"
              />
              <button
                onClick={() => void loadSessionView(sessionInput)}
                disabled={loadingSession}
                className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingSession ? "Loading Session..." : "Load Live Session"}
              </button>
            </div>
          </div>

          {session && (
            <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
                    Session Snapshot
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">{session.title}</h3>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100">
                  {sessionLabel}
                </span>
              </div>

              <div className="mt-5 space-y-3 text-sm text-slate-300">
                <p>
                  Join code:{" "}
                  <span className="font-mono text-base font-semibold uppercase tracking-[0.18em] text-white">
                    {session.joinCode}
                  </span>
                </p>
                <p>
                  Session account:{" "}
                  <span className="font-mono text-white">
                    {sessionPDA ? ellipsify(sessionPDA.toBase58(), 6) : "Not loaded"}
                  </span>
                </p>
                <p>
                  Creator:{" "}
                  <span className="font-mono text-white">
                    {ellipsify(session.authority.toBase58(), 6)}
                  </span>
                </p>
                <p>{session.roundCount} questions have been published in this session.</p>
                {joinUrl ? (
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(joinUrl);
                      toast.success("Invite link copied.");
                    }}
                    className="inline-flex rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-white/40"
                  >
                    Copy Invite Link
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/92 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                Live Vote
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {round ? round.prompt : "Waiting for the live ballot"}
              </h2>
            </div>
            {timeLeft !== null ? (
              <span
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  expired ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"
                }`}
              >
                {expired ? "Voting closed" : `${timeLeft}s left`}
              </span>
            ) : null}
          </div>

          {!round ? (
            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm leading-6 text-slate-600">
              {roundMessage}
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {roundOptions.map((option) => (
                  <button
                    key={`${option.label}-${option.index}`}
                    onClick={() => void handleVote(option.index)}
                    disabled={!sessionLive || !connected || hasVoted || expired || voting}
                    className={`rounded-[1.75rem] border-2 px-5 py-6 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                      hasVoted && myChoice === option.index
                        ? "border-emerald-500 bg-emerald-50"
                        : option.buttonClass
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold uppercase tracking-[0.18em] ${option.labelClass}`}
                    >
                      Choice {option.index + 1}
                    </p>
                    <p className="mt-3 text-xl font-semibold text-slate-950">
                      {option.label}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                {!connected ? (
                  <span>Connect your wallet to submit a vote.</span>
                ) : hasVoted ? (
                  <span className="font-medium text-emerald-700">
                    Your vote is locked in.
                  </span>
                ) : sessionLive ? (
                  <span>This prompt is live. Cast your vote before the timer ends.</span>
                ) : (
                  <span>This session is no longer accepting votes.</span>
                )}

                {lastTx ? (
                  <a
                    href={getExplorerUrl(`/tx/${lastTx}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950"
                  >
                    View transaction
                  </a>
                ) : null}
              </div>

              <div className="mt-8 rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-5">
                <div className="space-y-5">
                  {roundOptions.map((option) => (
                    <div key={`result-${option.label}-${option.index}`}>
                      <div className="mb-3 flex items-center justify-between text-sm font-medium text-slate-700">
                        <span>{option.label}</span>
                        <span>
                          {option.count} votes · {option.percentage}%
                        </span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${option.barClass}`}
                          style={{ width: `${option.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <span>{totalVotes} total votes</span>
                  {myChoice !== null ? (
                    <span>Your pick: {round.optionLabels[myChoice]}</span>
                  ) : (
                    <span>{round.optionLabels.length} options live</span>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[linear-gradient(180deg,#fffdf7_0%,#eef6ff_100%)] px-4 py-12 text-slate-700">
          Loading session...
        </div>
      }
    >
      <JoinPageContent />
    </Suspense>
  );
}
