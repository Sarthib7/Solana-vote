"use client";

import { useCallback, useMemo } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  PublicKey,
  SendTransactionError,
  SolanaJSONRPCError,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import idlJson from "../idl.json";

const PROGRAM_ID = new PublicKey(idlJson.address);
const IDL = idlJson as Idl;

export type SessionAccount = {
  authority: PublicKey;
  title: string;
  joinCode: string;
  sessionState: { active: {} } | { paused: {} } | { ended: {} };
  bump: number;
  roundCount: number;
};

export type VotingRoundAccount = {
  session: PublicKey;
  prompt: string;
  optionLabels: string[];
  optionCounts: BN[];
  startTime: BN;
  durationSeconds: BN;
  bump: number;
  roundIndex: number;
};

export type VoteRecordAccount = {
  voter: PublicKey;
  round: PublicKey;
  choice: number;
  bump: number;
};

export type LatestRoundSnapshot = {
  round: VotingRoundAccount;
  roundPDA: PublicKey;
};

type ReadonlyProvider = {
  connection: Connection;
};

function getProgram(provider: AnchorProvider | ReadonlyProvider): any {
  return new Program(IDL, provider);
}

function getSessionPDA(joinCode: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("session"), Buffer.from(joinCode)],
    PROGRAM_ID
  );
}

function getRoundPDA(sessionPDA: PublicKey, roundCount: number): [PublicKey, number] {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(roundCount);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), sessionPDA.toBuffer(), buf],
    PROGRAM_ID
  );
}

function getVoteRecordPDA(roundPDA: PublicKey, voter: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), roundPDA.toBuffer(), voter.toBuffer()],
    PROGRAM_ID
  );
}

function formatSimulationError(err: unknown, logs: readonly string[] | null | undefined): string {
  const meaningfulLog =
    logs
      ?.map((line) => line.replace(/^Program log:\s*/, "").trim())
      .filter(Boolean)
      .find(
        (line) =>
          line.includes("Error Message:") ||
          line.includes("AnchorError") ||
          /ConstraintSeeds|insufficient funds|insufficient lamports|already in use/i.test(
            line
          )
      ) ??
    logs
      ?.map((line) => line.replace(/^Program log:\s*/, "").trim())
      .filter(Boolean)
      .find((line) => !/invoke|consumed|success/i.test(line));

  const errText =
    typeof err === "string"
      ? err
      : err
        ? JSON.stringify(err)
        : "";

  const combined = [meaningfulLog, errText].filter(Boolean).join(" ").trim();
  if (!combined) {
    return "Transaction simulation failed.";
  }

  if (/insufficient funds|insufficient lamports/i.test(combined)) {
    return "The connected wallet does not have enough SOL to pay for this transaction.";
  }

  if (/ConstraintSeeds|seeds constraint/i.test(combined)) {
    return "The account address used by this action does not match the program's expected PDA seeds.";
  }

  return combined;
}

function formatRpcError(error: unknown): string {
  const anchorMessage =
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof (error as { error?: { errorMessage?: unknown } }).error?.errorMessage === "string"
      ? ((error as { error: { errorMessage: string } }).error.errorMessage as string)
      : null;

  if (anchorMessage) {
    return anchorMessage;
  }

  const logs =
    error instanceof SendTransactionError
      ? error.logs
      : typeof error === "object" &&
          error !== null &&
          "logs" in error &&
          Array.isArray((error as { logs?: unknown }).logs)
        ? ((error as { logs: string[] }).logs as string[])
        : undefined;

  if (logs?.length) {
    return formatSimulationError(undefined, logs);
  }

  if (error instanceof SolanaJSONRPCError) {
    return error.message;
  }

  if (error instanceof Error) {
    if (/insufficient funds|insufficient lamports/i.test(error.message)) {
      return "The connected wallet does not have enough SOL to pay for this transaction.";
    }
    return error.message;
  }

  return String(error);
}

async function simulateWalletInstruction(
  connection: Connection,
  payerKey: PublicKey,
  instruction: TransactionInstruction
) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);

  const simulation = await connection.simulateTransaction(transaction, {
    commitment: "confirmed",
    replaceRecentBlockhash: true,
    sigVerify: false,
  });

  if (simulation.value.err) {
    throw new Error(formatSimulationError(simulation.value.err, simulation.value.logs));
  }
}

export function useSolanaVote() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const provider = useMemo(() => {
    if (!wallet) {
      return {
        connection,
      };
    }

    return new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
  }, [connection, wallet]);

  const program = useMemo((): any => {
    return getProgram(provider);
  }, [provider]);

  const createSession = useCallback(
    async (title: string, joinCode: string) => {
      if (!program || !wallet) throw new Error("Wallet not connected");
      const [sessionPDA] = getSessionPDA(joinCode);
      const method = program.methods
        .createSession(title, joinCode)
        .accounts({
          authority: wallet.publicKey,
          session: sessionPDA,
          systemProgram: SystemProgram.programId,
        });

      try {
        const instruction = await method.instruction();
        await simulateWalletInstruction(connection, wallet.publicKey, instruction);
        const tx = await method.rpc();
        return { tx, sessionPDA };
      } catch (error) {
        throw new Error(formatRpcError(error));
      }
    },
    [connection, program, wallet]
  );

  const createRound = useCallback(
    async (
      sessionPDA: PublicKey,
      roundCount: number,
      prompt: string,
      optionLabels: string[],
      durationSeconds: number
    ) => {
      if (!wallet) throw new Error("Wallet not connected");
      const [roundPDA] = getRoundPDA(sessionPDA, roundCount);
      const method = program.methods
        .createRound(prompt, optionLabels, new BN(durationSeconds))
        .accounts({
          authority: wallet.publicKey,
          session: sessionPDA,
          round: roundPDA,
          systemProgram: SystemProgram.programId,
        });

      try {
        const instruction = await method.instruction();
        await simulateWalletInstruction(connection, wallet.publicKey, instruction);
        const tx = await method.rpc();
        return { tx, roundPDA };
      } catch (error) {
        throw new Error(formatRpcError(error));
      }
    },
    [connection, program, wallet]
  );

  const castVote = useCallback(
    async (roundPDA: PublicKey, choice: number) => {
      if (!program || !wallet) throw new Error("Wallet not connected");
      const [voteRecordPDA] = getVoteRecordPDA(roundPDA, wallet.publicKey);
      const method = program.methods
        .castVote(choice)
        .accounts({
          voter: wallet.publicKey,
          round: roundPDA,
          voteRecord: voteRecordPDA,
          systemProgram: SystemProgram.programId,
        });

      try {
        const instruction = await method.instruction();
        await simulateWalletInstruction(connection, wallet.publicKey, instruction);
        const tx = await method.rpc();
        return { tx, voteRecordPDA };
      } catch (error) {
        throw new Error(formatRpcError(error));
      }
    },
    [connection, program, wallet]
  );

  const closeSession = useCallback(
    async (sessionPDA: PublicKey) => {
      if (!program || !wallet) throw new Error("Wallet not connected");
      const method = program.methods
        .closeSession()
        .accounts({
          authority: wallet.publicKey,
          session: sessionPDA,
        });

      try {
        const instruction = await method.instruction();
        await simulateWalletInstruction(connection, wallet.publicKey, instruction);
        return await method.rpc();
      } catch (error) {
        throw new Error(formatRpcError(error));
      }
    },
    [connection, program, wallet]
  );

  const fetchSession = useCallback(
    async (sessionPDA: PublicKey): Promise<SessionAccount | null> => {
      if (!program) return null;
      try {
        return (await program.account.session.fetch(sessionPDA)) as any;
      } catch {
        return null;
      }
    },
    [program]
  );

  const fetchRound = useCallback(
    async (roundPDA: PublicKey): Promise<VotingRoundAccount | null> => {
      try {
        return (await program.account.votingRound.fetch(roundPDA)) as any;
      } catch {
        return null;
      }
    },
    [program]
  );

  const fetchVoteRecord = useCallback(
    async (roundPDA: PublicKey, voter: PublicKey): Promise<VoteRecordAccount | null> => {
      const [voteRecordPDA] = getVoteRecordPDA(roundPDA, voter);
      try {
        return (await program.account.voteRecord.fetch(voteRecordPDA)) as any;
      } catch {
        return null;
      }
    },
    [program]
  );

  const fetchLatestRound = useCallback(
    async (sessionPDA: PublicKey): Promise<LatestRoundSnapshot | null> => {
      const session = await fetchSession(sessionPDA);
      if (!session || session.roundCount === 0) return null;

      const [roundPDA] = getRoundPDA(sessionPDA, session.roundCount - 1);
      const round = await fetchRound(roundPDA);

      return round ? { round, roundPDA } : null;
    },
    [fetchRound, fetchSession]
  );

  const subscribeToSession = useCallback(
    (sessionPDA: PublicKey, callback: (session: SessionAccount) => void) => {
      const subId = connection.onAccountChange(sessionPDA, (accountInfo) => {
        try {
          const decoded = program.coder.accounts.decode("session", accountInfo.data);
          callback(decoded as SessionAccount);
        } catch (e) {
          console.error("Failed to decode session account", e);
        }
      });

      return () => {
        connection.removeAccountChangeListener(subId);
      };
    },
    [connection, program]
  );

  const subscribeToRound = useCallback(
    (roundPDA: PublicKey, callback: (round: VotingRoundAccount) => void) => {
      const subId = connection.onAccountChange(roundPDA, (accountInfo) => {
        try {
          const decoded = program.coder.accounts.decode("votingRound", accountInfo.data);
          callback(decoded as any);
        } catch (e) {
          console.error("Failed to decode round account", e);
        }
      });
      return () => {
        connection.removeAccountChangeListener(subId);
      };
    },
    [program, connection]
  );

  return {
    program,
    connection,
    wallet,
    createSession,
    createRound,
    castVote,
    closeSession,
    fetchSession,
    fetchRound,
    fetchLatestRound,
    fetchVoteRecord,
    subscribeToSession,
    subscribeToRound,
    getSessionPDA,
    getRoundPDA,
    getVoteRecordPDA,
    PROGRAM_ID,
  };
}
