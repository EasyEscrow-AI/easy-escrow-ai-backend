import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import fs from 'fs';

const SENDER_KEYPAIR_PATH = 'wallets/production/mainnet-sender.json';
const NFT_MINT = 'GP2jfodEJfCrJiA5fRpLGqDd2fs5vp2gdybqRJxrSxKM';
const RECIPIENT = 'F9CBP5fRjqizYDSryop8aVqGUD3ykWcqJBLZAHKRb6ut';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function main() {
  console.log('Loading keypair...');
  const senderKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(SENDER_KEYPAIR_PATH, 'utf-8')))
  );
  console.log('Sender:', senderKeypair.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const mint = new PublicKey(NFT_MINT);
  const recipient = new PublicKey(RECIPIENT);

  console.log('NFT Mint:', mint.toBase58());
  console.log('Recipient:', recipient.toBase58());

  // Initialize Metaplex with the sender keypair
  const metaplex = Metaplex.make(connection).use(keypairIdentity(senderKeypair));

  console.log('\nFetching NFT metadata...');
  const nft = await metaplex.nfts().findByMint({ mintAddress: mint });
  console.log('NFT Name:', nft.name);
  console.log('Token Standard:', nft.tokenStandard);

  console.log('\nTransferring pNFT...');
  const { response } = await metaplex.nfts().transfer({
    nftOrSft: nft,
    toOwner: recipient,
    authority: senderKeypair,
  });

  console.log('\n✅ Transfer successful!');
  console.log('Signature:', response.signature);
  console.log(`Explorer: https://solscan.io/tx/${response.signature}`);
}

main().catch(console.error);
