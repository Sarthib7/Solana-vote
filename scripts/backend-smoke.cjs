const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const anchor = require("@coral-xyz/anchor");
const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} = require("@solana/web3.js");

const ROOT = path.resolve(__dirname, "..");
const ANCHOR_DIR = path.join(ROOT, "anchor");
const IDL_PATH = path.join(ANCHOR_DIR, "target", "idl", "solana_vote.json");
const LOCAL_RPC = "http://127.0.0.1:8899";
const RPC_URL = process.env.SOLANA_RPC_URL || LOCAL_RPC;
const DEFAULT_WALLET = path.join(process.env.HOME, ".config", "solana", "id.json");

function readKeypair(filePath) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf8")))
  );
}

function getSessionPda(programId, joinCode) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("session"), Buffer.from(joinCode)],
    programId
  );
}

function getRoundPda(programId, sessionPda, roundCount) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(roundCount);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), sessionPda.toBuffer(), buf],
    programId
  );
}

function getVoteRecordPda(programId, roundPda, voter) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), roundPda.toBuffer(), voter.toBuffer()],
    programId
  );
}

async function confirmAirdrop(connection, signature) {
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature,
      ...latestBlockhash,
    },
    "confirmed"
  );
}

async function main() {
  process.env.ANCHOR_PROVIDER_URL = RPC_URL;
  process.env.ANCHOR_WALLET = process.env.ANCHOR_WALLET || DEFAULT_WALLET;

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const connection = new Connection(RPC_URL, "confirmed");
  const runVote = process.env.RUN_VOTE !== "0";
  const voteWithAuthority = process.env.VOTE_WITH_AUTHORITY === "1";
  const joinCode =
    process.env.JOIN_CODE ||
    `SM${Date.now().toString(36).toUpperCase().slice(-4)}`;

  const authorityWallet = new anchor.Wallet(readKeypair(process.env.ANCHOR_WALLET));
  const authorityProvider = new anchor.AnchorProvider(connection, authorityWallet, {
    commitment: "confirmed",
  });
  const authorityProgram = new anchor.Program(idl, authorityProvider);
  const programId = new PublicKey(idl.address);

  const title = `Smoke ${Date.now()}`;
  const [sessionPda] = getSessionPda(programId, joinCode);

  await authorityProgram.methods
    .createSession(title, joinCode)
    .accounts({
      authority: authorityProvider.wallet.publicKey,
      session: sessionPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const session = await authorityProgram.account.session.fetch(sessionPda);
  assert.equal(session.title, title);
  assert.equal(session.joinCode, joinCode);
  assert.equal(session.roundCount, 0);

  const [roundPda] = getRoundPda(programId, sessionPda, session.roundCount);
  await authorityProgram.methods
    .createRound("Pick the strongest option", ["Alpha", "Beta", "Gamma"], new anchor.BN(45))
    .accounts({
      authority: authorityProvider.wallet.publicKey,
      session: sessionPda,
      round: roundPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const roundBeforeVote = await authorityProgram.account.votingRound.fetch(roundPda);
  assert.deepEqual(roundBeforeVote.optionLabels, ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(
    roundBeforeVote.optionCounts.map((count) => count.toNumber()),
    [0, 0, 0]
  );

  let voterPublicKey = null;
  let roundAfterVote = roundBeforeVote;

  if (runVote) {
    let voterWallet = authorityWallet;
    let voterProvider = authorityProvider;
    let voterProgram = authorityProgram;

    if (!voteWithAuthority) {
      const voter = Keypair.generate();
      voterPublicKey = voter.publicKey;
      voterWallet = new anchor.Wallet(voter);
      voterProvider = new anchor.AnchorProvider(connection, voterWallet, {
        commitment: "confirmed",
      });
      voterProgram = new anchor.Program(idl, voterProvider);

      try {
        const airdropSignature = await connection.requestAirdrop(
          voter.publicKey,
          LAMPORTS_PER_SOL
        );
        await confirmAirdrop(connection, airdropSignature);
      } catch (error) {
        if (RPC_URL !== LOCAL_RPC) {
          voterWallet = authorityWallet;
          voterProvider = authorityProvider;
          voterProgram = authorityProgram;
          voterPublicKey = authorityWallet.publicKey;
          console.warn(
            "Falling back to the funded authority wallet for the devnet vote smoke."
          );
        } else {
          throw error;
        }
      }
    } else {
      voterPublicKey = authorityWallet.publicKey;
    }

    const [voteRecordPda] = getVoteRecordPda(
      programId,
      roundPda,
      voterProvider.wallet.publicKey
    );
    await voterProgram.methods
      .castVote(1)
      .accounts({
        voter: voterProvider.wallet.publicKey,
        round: roundPda,
        voteRecord: voteRecordPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    roundAfterVote = await authorityProgram.account.votingRound.fetch(roundPda);
    assert.deepEqual(
      roundAfterVote.optionCounts.map((count) => count.toNumber()),
      [0, 1, 0]
    );

    const voteRecord = await authorityProgram.account.voteRecord.fetch(voteRecordPda);
    assert.equal(voteRecord.choice, 1);
    assert.equal(
      voteRecord.voter.toBase58(),
      voterProvider.wallet.publicKey.toBase58()
    );
  }

  console.log(
    JSON.stringify(
      {
        rpcUrl: RPC_URL,
        session: sessionPda.toBase58(),
        joinCode,
        round: roundPda.toBase58(),
        voter: voterPublicKey?.toBase58() ?? null,
        optionCounts: roundAfterVote.optionCounts.map((count) => count.toNumber()),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
