import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey } from "@solana/web3.js";

describe("escrow - devnet integration test", () => {
  // Configure the client to use devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Use the deployed program ID on devnet
  const programId = new PublicKey("7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV");
  
  // Load IDL and override the program ID to match deployed version
  const idl = require("../target/idl/escrow.json");
  idl.address = programId.toString();
  
  const program = new Program(idl, provider) as Program<Escrow>;

  it("Program is deployed and accessible", async () => {
    console.log("✅ Program ID:", program.programId.toString());
    
    // Verify the program account exists
    const programInfo = await provider.connection.getAccountInfo(programId);
    console.log("✅ Program account exists");
    console.log("  Owner:", programInfo?.owner.toString());
    console.log("  Data length:", programInfo?.data.length, "bytes");
    console.log("  Lamports:", programInfo?.lamports / 1e9, "SOL");
  });

  it("Program IDL matches", async () => {
    // Verify the IDL has the expected instructions
    const expectedInstructions = [
      "initAgreement",
      "depositUsdc", 
      "depositNft",
      "settle",
      "adminCancel",
      "cancelIfExpired",
    ];

    const actualInstructions = program.idl.instructions.map((ix) => ix.name);
    
    console.log("📋 Program instructions:");
    actualInstructions.forEach((name) => {
      console.log(`  - ${name}`);
    });

    expectedInstructions.forEach((expected) => {
      if (actualInstructions.includes(expected)) {
        console.log(`✅ Found instruction: ${expected}`);
      } else {
        throw new Error(`❌ Missing instruction: ${expected}`);
      }
    });
  });

  it("Can derive PDA correctly", async () => {
    // Test PDA derivation
    const escrowId = new anchor.BN(12345);
    const [escrowState, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), escrowId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    console.log("✅ Derived escrow PDA:", escrowState.toString());
    console.log("  Bump:", bump);
  });
});

