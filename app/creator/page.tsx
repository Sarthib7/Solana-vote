"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { DevnetNotice } from "../components/devnet-notice";
import {
  SessionAccount,
  VotingRoundAccount,
  useSolanaVote,
} from "../lib/hooks/useSolanaVote";
import { ellipsify, getExplorerUrl } from "../lib/explorer";
import {
  buildJoinUrl,
  extractSessionLookup,
  generateJoinCode,
  isValidJoinCode,
  normalizeJoinCode,
} from "../lib/session-links";
import { getSessionStateLabel } from "../lib/session-state";

type RoundHistoryEntry = {
  data: VotingRoundAccount;
  pda: PublicKey;
};

type RoundOptionSummary = {
  index: number;
  label: string;
  count: number;
  percentage: number;
  toneClass: string;
};

const DEFAULT_OPTIONS = ["Yes", "No"];
const MAX_OPTIONS = 6;
const OPTION_TONES = [
  "bg-sky-500",
  "bg-orange-500",
  "bg-emerald-500",
  "bg-fuchsia-500",
  "bg-amber-500",
  "bg-indigo-500",
];

function getClusterLabel(rpcEndpoint: string) {
  if (rpcEndpoint.includes("127.0.0.1") || rpcEndpoint.includes("localhost")) {
    return "localnet";
  }
  if (rpcEndpoint.includes("devnet")) {
    return "devnet";
  }
  if (rpcEndpoint.includes("testnet")) {
    return "testnet";
  }
  return rpcEndpoint;
}

function getTotalVotes(round: VotingRoundAccount | null) {
  if (!round) return 0;
  return round.optionCounts.reduce((sum, count) => sum + count.toNumber(), 0);
}

function getRoundOptionSummaries(round: VotingRoundAccount | null): RoundOptionSummary[] {
  if (!round) return [];

  const totalVotes = getTotalVotes(round);

  return round.optionLabels.map((label, index) => {
    const count = round.optionCounts[index]?.toNumber() ?? 0;
    return {
      index,
      label,
      count,
      percentage: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
      toneClass: OPTION_TONES[index % OPTION_TONES.length],
    };
  });
}

function CreatorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey, connected } = useWallet();
  const {
    connection,
    createRound,
    createSession,
    fetchRound,
    fetchSession,
    getRoundPDA,
    getSessionPDA,
    subscribeToRound,
    subscribeToSession,
  } = useSolanaVote();

  const codeParam = searchParams.get("code");
  const legacySessionParam = searchParams.get("session");

  const [origin, setOrigin] = useState("");
  const [title, setTitle] = useState("");
  const [joinCode, setJoinCode] = useState(() => generateJoinCode());
  const [existingSessionInput, setExistingSessionInput] = useState("");
  const [session, setSession] = useState<SessionAccount | null>(null);
  const [sessionPDA, setSessionPDA] = useState<PublicKey | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<string[]>(DEFAULT_OPTIONS);
  const [duration, setDuration] = useState(30);
  const [publishingVote, setPublishingVote] = useState(false);

  const [activeRound, setActiveRound] = useState<VotingRoundAccount | null>(null);
  const [activeRoundPDA, setActiveRoundPDA] = useState<PublicKey | null>(null);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setWalletBalance(null);
      return;
    }

    let cancelled = false;

    void connection.getBalance(publicKey, "confirmed").then(
      (balance) => {
        if (!cancelled) {
          setWalletBalance(balance);
        }
      },
      () => {
        if (!cancelled) {
          setWalletBalance(null);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  const isSessionOwner = useMemo(() => {
    if (!session || !publicKey) return false;
    return publicKey.equals(session.authority);
  }, [publicKey, session]);

  const sessionLabel = useMemo(
    () => (session ? getSessionStateLabel(session.sessionState) : "Draft"),
    [session]
  );
  const joinUrl = useMemo(() => {
    if (!origin || !session) return "";
    return buildJoinUrl(origin, session.joinCode);
  }, [origin, session]);
  const totalVotes = useMemo(() => getTotalVotes(activeRound), [activeRound]);
  const activeRoundOptions = useMemo(
    () => getRoundOptionSummaries(activeRound),
    [activeRound]
  );
  const clusterLabel = useMemo(
    () => getClusterLabel(connection.rpcEndpoint),
    [connection.rpcEndpoint]
  );

  const loadRounds = useCallback(
    async (resolvedSessionPDA: PublicKey, sessionData: SessionAccount) => {
      if (sessionData.roundCount === 0) {
        setRoundHistory([]);
        setActiveRound(null);
        setActiveRoundPDA(null);
        return;
      }

      const rounds = await Promise.all(
        Array.from({ length: sessionData.roundCount }, async (_, index) => {
          const [roundPDA] = getRoundPDA(resolvedSessionPDA, index);
          const roundData = await fetchRound(roundPDA);
          return roundData ? { data: roundData, pda: roundPDA } : null;
        })
      );

      const loadedRounds = rounds.filter(Boolean) as RoundHistoryEntry[];
      setRoundHistory([...loadedRounds].reverse());

      const latestRound = loadedRounds[loadedRounds.length - 1];
      if (latestRound) {
        setActiveRound(latestRound.data);
        setActiveRoundPDA(latestRound.pda);
      }
    },
    [fetchRound, getRoundPDA]
  );

  const loadExistingSession = useCallback(
    async (value: string, silent = false) => {
      const lookup = extractSessionLookup(value);
      if (!lookup) {
        if (!silent) {
          toast.error("Paste a valid join link, join code, or legacy session address.");
        }
        return;
      }

      try {
        setSessionLoading(true);
        const resolvedSessionPDA = lookup.joinCode
          ? getSessionPDA(lookup.joinCode)[0]
          : new PublicKey(lookup.sessionAddress!);
        const sessionData = await fetchSession(resolvedSessionPDA);

        if (!sessionData) {
          throw new Error("Session not found on devnet.");
        }

        setExistingSessionInput(sessionData.joinCode);
        setJoinCode(sessionData.joinCode);
        setSessionPDA(resolvedSessionPDA);
        setSession(sessionData);
        await loadRounds(resolvedSessionPDA, sessionData);
        router.replace(`/creator?code=${encodeURIComponent(sessionData.joinCode)}`);
      } catch (error) {
        if (!silent) {
          toast.error(
            error instanceof Error ? error.message : "Unable to load session."
          );
        }
      } finally {
        setSessionLoading(false);
      }
    },
    [fetchSession, getSessionPDA, loadRounds, router]
  );

  useEffect(() => {
    const lookupValue = codeParam ?? legacySessionParam;
    if (!lookupValue) return;
    setExistingSessionInput(lookupValue);
    void loadExistingSession(lookupValue, true);
  }, [codeParam, legacySessionParam, loadExistingSession]);

  useEffect(() => {
    if (!sessionPDA) return;

    return subscribeToSession(sessionPDA, (updatedSession) => {
      setSession(updatedSession);
      void loadRounds(sessionPDA, updatedSession);
    });
  }, [loadRounds, sessionPDA, subscribeToSession]);

  useEffect(() => {
    if (!activeRoundPDA) return;
    return subscribeToRound(activeRoundPDA, setActiveRound);
  }, [activeRoundPDA, subscribeToRound]);

  const handleCreateSession = async () => {
    if (!connected || !publicKey) {
      toast.error("Connect a Phantom wallet with Testnet Mode enabled.");
      return;
    }

    const normalizedTitle = title.trim();
    const normalizedCode = normalizeJoinCode(joinCode);

    if (!normalizedTitle) {
      toast.error("Add a session title first.");
      return;
    }

    if (!isValidJoinCode(normalizedCode)) {
      toast.error("Join code must be 4-10 uppercase letters or numbers.");
      return;
    }

    try {
      setSessionLoading(true);

      const currentBalance = await connection.getBalance(publicKey, "confirmed");
      if (currentBalance < 0.02 * LAMPORTS_PER_SOL) {
        const isLocalnet =
          connection.rpcEndpoint.includes("127.0.0.1") ||
          connection.rpcEndpoint.includes("localhost");

        if (isLocalnet) {
          const signature = await connection.requestAirdrop(
            publicKey,
            2 * LAMPORTS_PER_SOL
          );
          const latestBlockhash = await connection.getLatestBlockhash("confirmed");
          await connection.confirmTransaction(
            {
              signature,
              ...latestBlockhash,
            },
            "confirmed"
          );
          toast.success("Airdropped 2 SOL on localnet for the connected wallet.");
        } else {
          throw new Error(
            `Connected wallet ${ellipsify(
              publicKey.toBase58(),
              4
            )} has ${(currentBalance / LAMPORTS_PER_SOL).toFixed(
              4
            )} SOL on ${clusterLabel}. This app is devnet-only. Enable Phantom Testnet Mode, fund the wallet on devnet, and retry.`
          );
        }
      }

      const [candidateSessionPDA] = getSessionPDA(normalizedCode);
      const existingSession = await fetchSession(candidateSessionPDA);
      if (existingSession) {
        throw new Error("That join code is already taken. Pick another code.");
      }

      const { tx, sessionPDA: nextSessionPDA } = await createSession(
        normalizedTitle,
        normalizedCode
      );
      const sessionData = await fetchSession(nextSessionPDA);

      if (!sessionData) {
        throw new Error("The session was created, but it could not be reloaded.");
      }

      setSessionPDA(nextSessionPDA);
      setSession(sessionData);
      setExistingSessionInput(sessionData.joinCode);
      setJoinCode(sessionData.joinCode);
      setTitle("");
      setRoundHistory([]);
      setActiveRound(null);
      setActiveRoundPDA(null);
      router.replace(`/creator?code=${encodeURIComponent(sessionData.joinCode)}`);

      toast.success("Session created on devnet.", {
        description: (
          <a
            href={getExplorerUrl(`/tx/${tx}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Session creation failed.";
      toast.error(
        message.includes("already in use")
          ? "That join code is already taken. Pick another code."
          : message
      );
    } finally {
      setSessionLoading(false);
    }
  };

  const handlePublishVote = async () => {
    if (!connected || !publicKey) {
      toast.error("Connect your wallet before publishing a vote.");
      return;
    }

    if (!session || !sessionPDA || !isSessionOwner) {
      toast.error("Only the creator wallet can publish new votes in this session.");
      return;
    }

    const normalizedPrompt = prompt.trim();
    const normalizedOptions = options.map((option) => option.trim());

    if (!normalizedPrompt) {
      toast.error("Add a question or proposal first.");
      return;
    }

    if (
      normalizedOptions.length < 2 ||
      normalizedOptions.length > MAX_OPTIONS ||
      normalizedOptions.some((option) => !option)
    ) {
      toast.error("Each live question needs 2 to 6 filled-in options.");
      return;
    }

    try {
      setPublishingVote(true);
      const { tx, roundPDA } = await createRound(
        sessionPDA,
        session.roundCount,
        normalizedPrompt,
        normalizedOptions,
        duration
      );

      const roundData = await fetchRound(roundPDA);
      if (roundData) {
        setActiveRound(roundData);
        setActiveRoundPDA(roundPDA);
      }

      const updatedSession = await fetchSession(sessionPDA);
      if (updatedSession) {
        setSession(updatedSession);
        await loadRounds(sessionPDA, updatedSession);
      }

      setPrompt("");

      toast.success("Live vote published.", {
        description: (
          <a
            href={getExplorerUrl(`/tx/${tx}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vote publishing failed.");
    } finally {
      setPublishingVote(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.17),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.15),transparent_26%),linear-gradient(180deg,#fffdf7_0%,#eef6ff_100%)] text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
            Creator Dashboard
          </p>
          <h1 className="text-lg font-semibold text-slate-900">
            Run a live quiz room from your wallet
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/join"
            className="hidden rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 sm:inline-flex"
          >
            Join Screen
          </Link>
          <WalletMultiButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-4 sm:px-6 lg:grid lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        {!session ? (
          <>
            <section className="rounded-[2rem] border border-white/70 bg-white/92 p-7 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                New Session
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Create a session with a short join code
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                The creator wallet owns the room. Once it is live, participants can
                scan a QR code or enter the join code without touching the raw
                session account address.
              </p>

              <div className="mt-6 space-y-3">
                <DevnetNotice compact />

                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Session title, e.g. Solana Workshop 2026"
                  maxLength={64}
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white"
                />

                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(event) => setJoinCode(normalizeJoinCode(event.target.value))}
                    placeholder="Join code"
                    maxLength={10}
                    className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setJoinCode(generateJoinCode())}
                    className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                  >
                    Randomize Code
                  </button>
                </div>

                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Use 4-10 uppercase letters or numbers.
                </p>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {publicKey ? (
                    <p>
                      Connected wallet {ellipsify(publicKey.toBase58(), 4)} has{" "}
                      <span className="font-semibold text-slate-900">
                        {walletBalance === null
                          ? "..."
                          : `${(walletBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`}
                      </span>{" "}
                      on <span className="font-semibold text-slate-900">{clusterLabel}</span>.
                    </p>
                  ) : (
                    <p>Connect a wallet to create a session on {clusterLabel}.</p>
                  )}
                </div>

                <button
                  onClick={() => void handleCreateSession()}
                  disabled={sessionLoading || !title.trim() || !joinCode.trim()}
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sessionLoading ? "Creating Session..." : "Create Session"}
                </button>
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-300">
                Continue Existing Session
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Reopen the dashboard from its join code or invite link
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Use the same creator wallet if you want to keep publishing live
                questions. Raw session addresses still work for legacy links, but the
                primary flow is code-based.
              </p>

              <div className="mt-6 space-y-3">
                <DevnetNotice compact />

                <textarea
                  value={existingSessionInput}
                  onChange={(event) => setExistingSessionInput(event.target.value)}
                  placeholder="Paste a join link, join code, or a legacy session address"
                  className="min-h-28 w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300 focus:bg-white/10"
                />
                <button
                  onClick={() => void loadExistingSession(existingSessionInput)}
                  disabled={sessionLoading}
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sessionLoading ? "Opening..." : "Open Session"}
                </button>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="space-y-5">
              <div className="rounded-[2rem] border border-white/70 bg-white/92 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                      Session Overview
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                      {session.title}
                    </h2>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p>
                        Status:{" "}
                        <span className="font-semibold text-slate-900">{sessionLabel}</span>
                      </p>
                      <p>
                        Join code:{" "}
                        <span className="font-mono text-base font-semibold uppercase tracking-[0.18em] text-slate-900">
                          {session.joinCode}
                        </span>
                      </p>
                      <p>
                        Creator:{" "}
                        <span className="font-mono text-slate-900">
                          {ellipsify(session.authority.toBase58(), 6)}
                        </span>
                      </p>
                      <p>
                        Session account:{" "}
                        <span className="font-mono text-slate-900">
                          {sessionPDA ? ellipsify(sessionPDA.toBase58(), 6) : "Not loaded"}
                        </span>
                      </p>
                      <p>{session.roundCount} published questions in this session.</p>
                    </div>
                  </div>

                  {joinUrl ? (
                    <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4 text-center">
                      <QRCodeSVG
                        value={joinUrl}
                        size={132}
                        bgColor="transparent"
                        fgColor="#0f172a"
                      />
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Scan to Join
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {joinUrl ? (
                    <>
                      <a
                        href={joinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                      >
                        Open Join Screen
                      </a>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(joinUrl);
                          toast.success("Invite link copied.");
                        }}
                        className="inline-flex rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                      >
                        Copy Invite Link
                      </button>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(session.joinCode);
                          toast.success("Join code copied.");
                        }}
                        className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                      >
                        Copy Join Code
                      </button>
                    </>
                  ) : null}
                </div>

                <p className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                  The QR code points to the current host. Once you run through ngrok
                  or deploy the app, scanning it sends participants straight to the
                  join page with the code preloaded.
                </p>

                {!isSessionOwner ? (
                  <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                    This dashboard is open in read-only mode. Connect with the wallet
                    that created the session to publish new live questions.
                  </p>
                ) : null}
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-300">
                  Publish Question
                </p>
                <h3 className="mt-2 text-2xl font-semibold">
                  Push a live vote or quiz-style prompt to the room
                </h3>

                <div className="mt-5 space-y-3">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="What should everyone vote on right now?"
                    maxLength={128}
                    className="min-h-28 w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300 focus:bg-white/10"
                  />

                  <div className="space-y-3">
                    {options.map((option, index) => (
                      <div key={`${index}-${options.length}`} className="flex gap-3">
                        <input
                          type="text"
                          value={option}
                          onChange={(event) =>
                            setOptions((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? event.target.value : item
                              )
                            )
                          }
                          placeholder={`Option ${index + 1}`}
                          maxLength={32}
                          className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300 focus:bg-white/10"
                        />
                        {options.length > 2 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setOptions((current) =>
                                current.filter((_, itemIndex) => itemIndex !== index)
                              )
                            }
                            className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/35"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setOptions((current) =>
                            current.length >= MAX_OPTIONS ? current : [...current, ""]
                          )
                        }
                        disabled={options.length >= MAX_OPTIONS}
                        className="inline-flex items-center justify-center rounded-full border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/35 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add Option
                      </button>
                      <select
                        value={duration}
                        onChange={(event) => setDuration(Number(event.target.value))}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                      >
                        <option value={15}>15 seconds</option>
                        <option value={30}>30 seconds</option>
                        <option value={60}>60 seconds</option>
                        <option value={120}>2 minutes</option>
                        <option value={0}>No timer</option>
                      </select>
                    </div>

                    <button
                      onClick={() => void handlePublishVote()}
                      disabled={
                        publishingVote ||
                        !isSessionOwner ||
                        !prompt.trim() ||
                        options.some((option) => !option.trim())
                      }
                      className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {publishingVote ? "Publishing..." : "Publish Live Vote"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <div className="rounded-[2rem] border border-white/70 bg-white/92 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                      Live Result Board
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                      {activeRound ? activeRound.prompt : "No live vote yet"}
                    </h3>
                  </div>
                  {activeRound ? (
                    <span className="rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-700">
                      Vote #{activeRound.roundIndex + 1}
                    </span>
                  ) : null}
                </div>

                {!activeRound ? (
                  <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm leading-6 text-slate-600">
                    Publish the first question to populate the live dashboard and the
                    participant screens.
                  </div>
                ) : (
                  <>
                    <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-5">
                      <div className="space-y-5">
                        {activeRoundOptions.map((option) => (
                          <div key={`${option.label}-${option.index}`}>
                            <div className="mb-3 flex items-center justify-between text-sm font-medium text-slate-700">
                              <span>{option.label}</span>
                              <span>
                                {option.count} votes · {option.percentage}%
                              </span>
                            </div>
                            <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${option.toneClass}`}
                                style={{ width: `${option.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <span>{activeRound.optionLabels.length} options live</span>
                        <span>{totalVotes} total votes</span>
                      </div>
                    </div>

                    {activeRoundPDA ? (
                      <a
                        href={getExplorerUrl(`/address/${activeRoundPDA.toBase58()}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950"
                      >
                        View live round account
                      </a>
                    ) : null}
                  </>
                )}
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white/92 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">
                  Session Feed
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                  Published questions
                </h3>

                <div className="mt-5 space-y-3">
                  {roundHistory.length === 0 ? (
                    <p className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm leading-6 text-slate-600">
                      The feed is empty until the first vote is published.
                    </p>
                  ) : (
                    roundHistory.map(({ data, pda }) => (
                      <button
                        key={pda.toBase58()}
                        onClick={() => {
                          setActiveRound(data);
                          setActiveRoundPDA(pda);
                        }}
                        className="flex w-full items-center justify-between gap-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white"
                      >
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Vote #{data.roundIndex + 1}
                          </p>
                          <p className="mt-1 text-base font-semibold text-slate-950">
                            {data.prompt}
                          </p>
                          <p className="mt-2 text-sm text-slate-600">
                            {data.optionLabels
                              .map((label, index) => {
                                const count = data.optionCounts[index]?.toNumber() ?? 0;
                                return `${label}: ${count}`;
                              })
                              .join(" • ")}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                          View
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function CreatorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[linear-gradient(180deg,#fffdf7_0%,#eef6ff_100%)] px-4 py-12 text-slate-700">
          Loading creator dashboard...
        </div>
      }
    >
      <CreatorPageContent />
    </Suspense>
  );
}
