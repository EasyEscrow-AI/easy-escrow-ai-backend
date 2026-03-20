/**
 * AI Chat Knowledgebase — Static knowledge for the EasyEscrow AI Assistant
 *
 * Contains curated information about:
 * - AMINA Group (formerly SEBA Bank) — crypto-native banking partner
 * - Stablecoin compliance frameworks and regulations
 * - Solana blockchain fundamentals relevant to EasyEscrow
 * - EasyEscrow platform specifics
 *
 * This content is injected into the system prompt so the AI can answer
 * knowledgebase questions without requiring external lookups.
 */

export const KNOWLEDGEBASE = `
## Knowledgebase

Use the following reference material to answer user questions accurately. When answering from this knowledgebase, cite the relevant section. If the user's question is not covered here and not covered by your general knowledge of the allowed topics, say so honestly rather than guessing.

---

### AMINA Group (formerly SEBA Bank)

**Overview:** AMINA Group AG (rebranded from SEBA Bank AG in 2023) is a licensed Swiss bank specializing in digital assets and traditional financial services. Headquartered in Zug, Switzerland, AMINA holds a Swiss banking and securities dealer license from FINMA (Swiss Financial Market Supervisory Authority), making it one of the first fully regulated crypto banks globally.

**Key Facts:**
- Founded in 2018, received FINMA banking license in August 2019
- Rebranded from SEBA Bank to AMINA Group in October 2023
- Offers integrated banking services bridging traditional finance and digital assets
- Regulated by FINMA under Swiss Banking Act and Anti-Money Laundering Act
- Provides custody, trading, lending, tokenization, and staking services
- Supports institutional and qualified private clients globally
- Member of the Swiss Bankers Association (SBA)

**Services Relevant to Cross-Border Payments:**
- **Custody:** Institutional-grade custody for digital assets including stablecoins (USDC, USDT)
- **Trading:** OTC and exchange trading for crypto assets and stablecoins
- **Fiat On/Off Ramp:** Conversion between fiat currencies (CHF, EUR, USD, SGD, HKD) and digital assets
- **Tokenization:** Tokenization of traditional assets on blockchain
- **Staking:** Institutional staking services for Proof-of-Stake networks including Solana
- **Banking:** Full Swiss banking services including multi-currency accounts

**AMINA and Stablecoin Payments:**
- AMINA provides the banking rails for institutional stablecoin settlement
- Clients can hold USDC in AMINA custody and settle via Swiss banking infrastructure
- AMINA's FINMA license ensures AML/KYC compliance for all transactions
- The bank acts as a regulated bridge between on-chain stablecoin transfers and traditional banking

**Regulatory Framework:**
- Supervised by FINMA (Swiss Financial Market Supervisory Authority)
- Compliant with Swiss Anti-Money Laundering Act (AMLA)
- Subject to Swiss Financial Market Infrastructure Act (FinMIA)
- Adheres to FATF Travel Rule requirements for virtual asset transfers
- Participates in Swiss self-regulatory organizations for AML compliance

---

### Stablecoin Compliance

**What Are Stablecoins?**
Stablecoins are digital tokens pegged to a stable asset (typically USD). USDC (USD Coin) by Circle is fully backed by cash and short-term US Treasuries, with monthly attestations by Grant Thornton. USDT (Tether) is the largest by market cap but has less transparent reserves.

**Why USDC for Cross-Border Payments:**
- 1:1 USD backing with transparent reserves
- Settlement in seconds on Solana (vs. 1-5 days for SWIFT)
- Fraction of the cost of traditional wire transfers (< $0.01 vs. $25-50)
- 24/7 settlement (no banking hours restriction)
- Programmable with escrow, conditions, and automated compliance
- Native on Solana as an SPL token (6 decimal precision)

**Key Regulations:**

**1. Anti-Money Laundering (AML):**
- All institutions handling stablecoins must implement AML programs
- Customer Due Diligence (CDD) and Enhanced Due Diligence (EDD) for high-risk clients
- Transaction monitoring for suspicious patterns
- Suspicious Activity Reports (SARs) filing obligations
- Record-keeping requirements (typically 5-7 years)

**2. Know Your Customer (KYC):**
- Identity verification for all institutional clients
- Beneficial ownership identification (25%+ ownership threshold)
- Ongoing monitoring and periodic reviews
- Source of funds and source of wealth verification
- PEP (Politically Exposed Persons) screening

**3. FATF Travel Rule:**
- Virtual Asset Service Providers (VASPs) must exchange originator and beneficiary information for transfers above $1,000
- Applies to stablecoin transfers between institutions
- Required fields: originator name, account number, address; beneficiary name, account number

**4. EU Markets in Crypto-Assets (MiCA):**
- Effective June 2024 (stablecoins) / December 2024 (full framework)
- Requires stablecoin issuers to be authorized as Electronic Money Institutions
- Reserve requirements: 1:1 backing with liquid assets
- Significant stablecoins face additional requirements (>€5B daily volume)
- All crypto-asset service providers (CASPs) must be authorized in at least one EU member state

**5. Singapore Payment Services Act (PSA):**
- MAS (Monetary Authority of Singapore) regulates Digital Payment Token services
- Stablecoin framework announced August 2023
- Single-currency stablecoins pegged to SGD or G10 currencies
- Minimum reserve and disclosure requirements
- Capital requirements for stablecoin issuers

**6. Swiss DLT Framework:**
- Swiss Financial Market Infrastructure Act accommodates DLT-based assets
- DLT trading facilities can operate with FINMA license
- Stablecoins treated as deposits under Swiss Banking Act
- AML obligations under Swiss AMLA apply to all virtual asset intermediaries

**7. Sanctions Compliance:**
- OFAC (US), EU, UN, and Swiss SECO sanctions lists must be screened
- Real-time screening of wallet addresses against known sanctioned addresses
- Blockchain analytics tools (Chainalysis, Elliptic) for on-chain compliance
- Travel Rule compliance for cross-border stablecoin transfers

**Compliance Best Practices for Institutions:**
- Implement transaction monitoring with blockchain analytics
- Maintain complete audit trails for all escrow transactions
- Conduct periodic risk assessments of payment corridors
- Screen all counterparties against sanctions lists before initiating transfers
- Document source of funds for large transactions (typically >$10,000)
- Report suspicious activities to relevant Financial Intelligence Units (FIUs)

---

### Solana Blockchain

**Overview:** Solana is a high-performance Layer 1 blockchain known for fast transaction times (~400ms block time) and low fees (< $0.01 per transaction). It uses a unique combination of Proof of History (PoH) and Proof of Stake (PoS) consensus.

**Key Technical Details:**
- **TPS:** Theoretical max ~65,000 TPS, practical throughput ~3,000-4,000 TPS
- **Block Time:** ~400ms
- **Finality:** ~12 seconds for confirmed, ~32 slots for finalized
- **Transaction Fee:** ~0.000005 SOL (< $0.01)
- **Programs:** Smart contracts on Solana are called "programs" (written in Rust)
- **Accounts:** Solana uses an account model (not UTXO). Data is stored in accounts.

**SPL Tokens (Solana Program Library):**
- SPL tokens are Solana's token standard (like ERC-20 on Ethereum)
- USDC on Solana is an SPL token with 6 decimal places
- USDC Mint Address (Mainnet): EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
- Token accounts: Each wallet needs an Associated Token Account (ATA) for each SPL token
- Token Program: Handles transfers, minting, burning of SPL tokens

**Solana for Cross-Border Payments:**
- Near-instant settlement (seconds vs. days)
- Minimal fees compared to SWIFT ($0.01 vs. $25-50)
- Programmable escrow via on-chain programs
- Transparent and auditable on-chain history
- USDC is natively issued on Solana by Circle
- Wormhole bridge connects Solana to Ethereum and other chains

**Compressed NFTs (cNFTs):**
- Use Merkle tree compression to reduce on-chain storage costs
- Up to 1000x cheaper than regular NFTs
- Stored using Bubblegum program and concurrent Merkle trees
- Require DAS (Digital Asset Standard) API for reading metadata and proofs
- Transfer requires Merkle proofs from DAS API

**Durable Nonces:**
- Allow pre-signing transactions that can be submitted later
- Used in escrow systems for multi-party transaction signing
- Nonce accounts store a recent blockhash that doesn't expire
- Essential for atomic swap operations where multiple parties sign at different times

---

### EasyEscrow Platform

**What is EasyEscrow.ai?**
EasyEscrow.ai is a Solana-based platform providing trustless escrow services for two distinct use cases:

**1. Atomic Swaps (Peer-to-Peer NFT Trading):**
- Trustless NFT↔SOL, NFT↔NFT, and cNFT↔SOL exchanges
- Supports bulk swaps (up to 4 NFTs total per swap)
- Uses Jito bundles for multi-transaction swaps with TwoPhase fallback
- Simple 1-for-1 swaps use escrow-based atomic transactions
- All swap fees collected in native SOL

**2. Institution Escrow (Cross-Border USDC Payments):**
- USDC-based cross-border payment escrow for institutional clients
- Supported corridors: SG-CH (Singapore↔Switzerland), and more
- AI-powered compliance analysis before escrow release
- Document uploads for supporting trade documentation
- KYC/KYB onboarding with tiered access levels
- Escrow lifecycle: Created → Funded → (Compliance Check) → Released/Cancelled
- Platform fees calculated on escrow amount
- Settlement authority pattern for secure release operations
- Default escrow expiry: 72 hours (configurable)
- Amount limits: $100 minimum, $1,000,000 maximum (default)

**Platform Architecture:**
- Backend: Node.js/Express/TypeScript API
- Database: PostgreSQL with Prisma ORM
- Blockchain: Solana (mainnet and devnet/staging)
- Cache: Redis for rate limiting and caching
- Storage: DigitalOcean Spaces for document uploads
- AI: Claude API for compliance analysis and chat assistant
- Deployment: DigitalOcean App Platform

**Escrow Codes:**
- Each institution escrow has a human-readable code: EE-XXX-XXX
- This code can be used to look up escrow details
- Separate from the internal UUID and on-chain PDA

**Client Tiers:**
- STANDARD: Default tier for new clients
- ENTERPRISE: Higher limits and additional features
- Tier determines rate limits, escrow limits, and feature access

**Compliance Features:**
- AI-powered document analysis (invoices, contracts, compliance docs)
- Risk scoring (0-100) with APPROVE/REVIEW/REJECT recommendations
- Audit logging for all escrow state changes
- Sanctions screening integration
- FATF Travel Rule data collection

**Solstice Yield:**
- Planned integration for stablecoin yield on idle escrow funds
- Institutional-grade yield strategies for USDC
- Risk-adjusted returns with transparent reporting
`;
