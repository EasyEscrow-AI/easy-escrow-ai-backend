/**
 * AI Chat FAQ — Pre-built answers for common questions
 *
 * These entries are matched against incoming chat messages using keyword scoring.
 * When a match is found above the confidence threshold, the pre-built answer is
 * returned instantly without calling the Claude API, dramatically reducing latency
 * and token usage.
 *
 * Each entry has:
 * - patterns: Phrases that trigger this FAQ (normalized, lowercase)
 * - keywords: Weighted terms for scoring (order = priority)
 * - shortAnswer: Concise 2-3 sentence response (returned by default)
 * - detailedAnswer: Full markdown response (returned on "tell me more")
 */

export interface FaqEntry {
  id: string;
  category: 'fees' | 'platform' | 'compliance' | 'technical' | 'account' | 'comparison' | 'yield';
  patterns: string[];
  keywords: string[];
  shortAnswer: string;
  detailedAnswer: string;
}

export const FAQ_ENTRIES: FaqEntry[] = [
  // ═══════════════════════════════════════════════════
  // FEES & PRICING
  // ═══════════════════════════════════════════════════
  {
    id: 'platform-fee',
    category: 'fees',
    patterns: [
      'what is the platform fee',
      'how much does it cost',
      'what are the fees',
      'explain the platform fee',
      'what does the fee cover',
      'how much do you charge',
      'platform fee for stablecoin payments',
      'escrow fee',
      'transaction fee',
      'what are your charges',
      'pricing',
      'cost of escrow',
      'fee structure',
      '0.20% fee',
      '20 bps',
      '20 basis points',
    ],
    keywords: ['fee', 'cost', 'charge', 'price', 'pricing', 'bps', 'basis', 'percent', 'platform'],
    shortAnswer: `**0.20% (20 bps)** of the escrow amount, with a **minimum fee of $0.20** and **maximum fee of $20.00**. Covers smart contract execution, AI compliance analysis, Solana network fees, and 24/7 settlement. Compare: SWIFT costs 1-3% + $25-50 fixed fees and takes 1-5 days. Example: $100K escrow = **$20 fee** (capped) vs $1,000-$3,000+ traditional.`,
    detailedAnswer: `### Platform Fee

EasyEscrow charges a **0.20% (20 basis points)** platform fee on institution escrow transactions. This is calculated on the escrow amount at the time of creation.

**Fee Limits:**
- **Minimum fee:** $0.20 USDC — ensures cost recovery on small transactions
- **Maximum fee:** $20.00 USDC — caps the fee regardless of escrow size
- Institutions can configure custom fee rates (within protocol limits) via Settings

**Examples:**
| Escrow Amount | Raw 0.20% Fee | Actual Fee (capped) |
|---|---|---|
| $50 | $0.10 | **$0.20** (minimum) |
| $1,000 | $2.00 | $2.00 |
| $10,000 | $20.00 | $20.00 |
| $100,000 | $200.00 | **$20.00** (maximum) |
| $1,000,000 | $2,000.00 | **$20.00** (maximum) |

**What the fee covers:**
- **Escrow smart contract execution** — on-chain program interactions for creating, funding, and releasing escrows
- **AI-powered compliance analysis** — automated risk scoring and document verification before release
- **Solana network fees** — all blockchain transaction costs are absorbed by the platform
- **24/7 settlement infrastructure** — continuous availability with no banking-hours restrictions
- **Audit trail & reporting** — immutable on-chain records and compliance documentation

**How it compares to traditional cross-border payments:**

| Method | Typical Cost | Settlement Time |
|--------|-------------|-----------------|
| **EasyEscrow** | **0.20% (min $0.20, max $20)** | **Seconds** |
| SWIFT wire transfer | 1-3% + $25-50 fixed fees | 1-5 business days |
| Traditional escrow | 1-2% of transaction value | Days to weeks |
| PayPal cross-border | 3-5% | 1-3 business days |
| Bank letter of credit | 1.5-8% | Weeks |

**Example:** On a $100,000 USDC escrow, the platform fee is capped at **$20** — compared to $1,000-$3,000+ via traditional methods.

The fee is deducted from the escrow amount when the escrow is released to the recipient.`,
  },

  {
    id: 'escrow-limits',
    category: 'fees',
    patterns: [
      'what are the escrow limits',
      'minimum escrow amount',
      'maximum escrow amount',
      'how much can i escrow',
      'transaction limits',
      'minimum amount',
      'maximum amount',
      'escrow amount limits',
      'what is the minimum',
      'what is the maximum',
    ],
    keywords: ['limit', 'minimum', 'maximum', 'amount', 'min', 'max', 'escrow'],
    shortAnswer: `**Min: $10 USDC** / **Max: $100,000,000 USDC** per escrow. No limit on number of escrows. Corridor-specific limits may also apply.`,
    detailedAnswer: `### Escrow Amount Limits

| Limit | Amount |
|-------|--------|
| **Minimum** | $10 USDC |
| **Maximum** | $100,000,000 USDC |

These limits apply per individual escrow transaction. There is no limit on the number of escrows you can create.

Corridor-specific limits may also apply — some payment corridors have their own minimum and maximum thresholds based on regulatory requirements. Use the **get_platform_info** tool or check the Corridors section in your dashboard for corridor-specific limits.

Enterprise-tier clients may have customized limits. Contact your account manager for details.`,
  },

  // ═══════════════════════════════════════════════════
  // PLATFORM & ESCROW LIFECYCLE
  // ═══════════════════════════════════════════════════
  {
    id: 'how-escrow-works',
    category: 'platform',
    patterns: [
      'how does escrow work',
      'how does the escrow process work',
      'explain the escrow process',
      'escrow lifecycle',
      'what is the escrow flow',
      'how do i use escrow',
      'escrow steps',
      'walk me through the escrow process',
      'how does the payment process work',
      'how does easyescrow work',
      'explain how payments work',
    ],
    keywords: ['escrow', 'process', 'work', 'lifecycle', 'flow', 'step', 'how'],
    shortAnswer: `Trustless USDC escrow on Solana. **5 steps:** Create escrow → Fund with USDC → AI compliance check → Release to recipient → Done. Settles in **seconds**. Payer can cancel anytime before release for a full refund. Escrows expire after 72 hours if not completed.`,
    detailedAnswer: `### How EasyEscrow Works

EasyEscrow provides trustless USDC escrow for cross-border payments. Here's the lifecycle:

**1. Create Escrow**
- Specify amount (USDC), recipient wallet, payment corridor, and conditions
- An on-chain escrow PDA (Program Derived Address) is created on Solana
- A unique escrow code (e.g., \`EE-ABC-123\`) is assigned

**2. Fund Escrow**
- Send USDC to the escrow PDA from your registered wallet
- The deposit is confirmed on-chain and recorded
- Platform fee (0.20%) is calculated on the escrow amount

**3. Compliance Check**
- AI-powered analysis reviews the transaction for risk factors
- Documents can be uploaded for additional verification (invoices, contracts)
- Risk score (0-100) is calculated with APPROVE/REVIEW/REJECT recommendation
- High-risk transactions may be placed on COMPLIANCE_HOLD

**4. Release**
- Once compliance is cleared, funds are released to the recipient wallet
- The settlement authority signs the release transaction
- USDC is transferred directly to the recipient's wallet on Solana

**5. Alternative Outcomes**
- **Cancellation:** Payer can cancel before release — funds are refunded
- **Expiry:** Uncompleted escrows expire after 72 hours (configurable) — funds auto-refund
- **Dispute:** Either party can raise a dispute for manual review

The entire process settles in **seconds** on Solana, compared to days with traditional banking.`,
  },

  {
    id: 'escrow-expiry',
    category: 'platform',
    patterns: [
      'how long does an escrow last',
      'escrow expiry',
      'when does escrow expire',
      'escrow timeout',
      'expiration time',
      'how long before escrow expires',
      'default expiry',
      'escrow duration',
    ],
    keywords: ['expiry', 'expire', 'timeout', 'duration', 'long', 'last', 'hours'],
    shortAnswer: `**72 hours** from creation (configurable). If not completed within that window, the escrow expires and funded USDC is automatically refunded to the payer.`,
    detailedAnswer: `### Escrow Expiry

The default escrow expiry is **72 hours** from creation. If the escrow is not funded and released within this window, it automatically expires and any deposited funds are refunded to the payer's wallet.

**Key points:**
- The 72-hour window is configurable per escrow at creation time
- Expired escrows trigger an automatic on-chain refund transaction
- The expiry clock starts at escrow creation, not at funding
- You can check the expiry time for any escrow via the dashboard or API
- Enterprise-tier clients can request custom expiry windows`,
  },

  {
    id: 'escrow-statuses',
    category: 'platform',
    patterns: [
      'what are the escrow statuses',
      'escrow status meaning',
      'what does funded mean',
      'what does compliance hold mean',
      'escrow states',
      'explain escrow statuses',
      'status definitions',
    ],
    keywords: [
      'status',
      'state',
      'funded',
      'released',
      'cancelled',
      'compliance',
      'hold',
      'created',
    ],
    shortAnswer: `**Happy path:** CREATED → FUNDED → RELEASING → RELEASED. Other states: COMPLIANCE_HOLD (flagged for review), CANCELLING/CANCELLED (refunded), EXPIRED (auto-refunded after 72h), FAILED (rare error).`,
    detailedAnswer: `### Escrow Statuses

| Status | Meaning |
|--------|---------|
| **CREATED** | Escrow has been initialized on-chain but not yet funded |
| **FUNDED** | USDC has been deposited into the escrow PDA |
| **COMPLIANCE_HOLD** | AI compliance analysis flagged the transaction for review |
| **RELEASING** | Release transaction is being processed on-chain |
| **RELEASED** | Funds have been successfully transferred to the recipient |
| **CANCELLING** | Cancellation/refund transaction is being processed |
| **CANCELLED** | Escrow was cancelled and funds refunded to the payer |
| **EXPIRED** | Escrow exceeded its expiry window and funds were auto-refunded |
| **FAILED** | A transaction error occurred (rare — contact support) |

**Normal happy path:** CREATED → FUNDED → RELEASING → RELEASED

**Compliance path:** CREATED → FUNDED → COMPLIANCE_HOLD → (manual review) → RELEASING → RELEASED`,
  },

  {
    id: 'escrow-codes',
    category: 'platform',
    patterns: [
      'what is an escrow code',
      'escrow code format',
      'what does ee mean',
      'how do escrow codes work',
      'escrow reference number',
      'escrow identifier',
    ],
    keywords: ['code', 'ee', 'reference', 'identifier', 'format'],
    shortAnswer: `Format: **\`EE-XXX-XXX\`** (e.g., \`EE-ABC-123\`). Assigned at creation, permanent. Use it to look up escrows or share as a payment reference. Ask me *"show me EE-ABC"* to search.`,
    detailedAnswer: `### Escrow Codes

Every institution escrow is assigned a unique human-readable code in the format **\`EE-XXX-XXX\`** (e.g., \`EE-ABC-123\`).

- The code is generated at escrow creation and is permanent
- Use it to look up escrow details in the dashboard or via the AI assistant
- It's separate from the internal UUID and the on-chain PDA address
- Share it with counterparties as a payment reference

You can search for escrows by code (partial match supported) — just ask me something like *"show me escrow EE-ABC"*.`,
  },

  {
    id: 'supported-corridors',
    category: 'platform',
    patterns: [
      'what corridors are supported',
      'payment corridors',
      'which countries',
      'supported countries',
      'where can i send payments',
      'available corridors',
      'which routes',
      'singapore to switzerland',
      'sg-ch corridor',
    ],
    keywords: [
      'corridor',
      'country',
      'countries',
      'route',
      'supported',
      'singapore',
      'switzerland',
    ],
    shortAnswer: `Currently: **SG-CH** (Singapore ↔ Switzerland). Each corridor has its own amount limits and risk level. More corridors being added. Ask me to *"get platform info"* for current details.`,
    detailedAnswer: `### Supported Payment Corridors

EasyEscrow currently supports institutional cross-border payments on the following corridors:

- **SG-CH** — Singapore ↔ Switzerland

Each corridor has its own:
- Minimum and maximum transaction amounts
- Risk level classification
- Regulatory requirements

Additional corridors are being added based on institutional demand and regulatory approvals. For the latest corridor details including specific limits, ask me to *"get platform info"* and I'll pull the current configuration.`,
  },

  // ═══════════════════════════════════════════════════
  // COMPLIANCE & SECURITY
  // ═══════════════════════════════════════════════════
  {
    id: 'compliance-checks',
    category: 'compliance',
    patterns: [
      'what compliance checks are performed',
      'how does compliance work',
      'ai compliance analysis',
      'risk scoring',
      'how is risk calculated',
      'compliance process',
      'what does the ai check',
      'automated compliance',
      'risk assessment',
      'compliance review',
    ],
    keywords: ['compliance', 'risk', 'check', 'analysis', 'score', 'ai', 'review', 'assessment'],
    shortAnswer: `Every escrow undergoes **AI-powered compliance analysis**. Risk score 0-100: **Low (0-30)** auto-approved, **Medium (31-70)** flagged for review, **High (71-100)** placed on COMPLIANCE_HOLD. Analyzes transaction details, documents, sanctions, and patterns. Completes in **seconds**.`,
    detailedAnswer: `### AI-Powered Compliance Analysis

Every institution escrow undergoes automated compliance analysis powered by Claude AI. Here's how it works:

**What's analyzed:**
- Transaction amount and corridor risk profile
- Counterparty information and jurisdiction
- Uploaded supporting documents (invoices, contracts, trade docs)
- Historical transaction patterns for the client
- Sanctions screening results

**Risk Scoring:**
- Each transaction receives a risk score from **0 to 100**
- **0-30 (Low):** Auto-approved, proceeds to release
- **31-70 (Medium):** Flagged for additional review
- **71-100 (High):** Placed on COMPLIANCE_HOLD for manual review

**AI Recommendations:**
- **APPROVE** — Transaction meets all compliance criteria
- **REVIEW** — Additional documentation or verification recommended
- **REJECT** — Significant compliance concerns identified

**Document Analysis:**
Upload supporting documents (PDF, images) and the AI will:
- Extract key information from invoices and contracts
- Verify consistency between document details and escrow parameters
- Flag discrepancies in amounts, dates, or counterparty details
- Check for common fraud indicators

Compliance analysis typically completes in **seconds**, compared to days for manual review processes.`,
  },

  {
    id: 'kyc-kyb',
    category: 'compliance',
    patterns: [
      'how does kyc work',
      'kyc process',
      'kyc requirements',
      'kyb requirements',
      'kyc kyb',
      'onboarding process',
      'how do i get onboarded',
      'verification requirements',
      'identity verification',
      'know your customer',
      'know your business',
      'what documents do i need to onboard',
    ],
    keywords: ['kyc', 'kyb', 'onboard', 'onboarding', 'verification', 'identity'],
    shortAnswer: `**Allowlist-based** onboarding (not open signup). Requires company registration docs, beneficial ownership info, and authorized signatory ID. Process: Application → KYB review → KYC check → Approval → Wallet registration. Contact your relationship manager to get started.`,
    detailedAnswer: `### KYC/KYB Onboarding

EasyEscrow uses an **allowlist-based onboarding** process for institutional clients (not open signup).

**Requirements:**
- Company registration documents
- Beneficial ownership information (25%+ ownership)
- Authorized signatory identification
- Source of funds documentation
- Compliance officer designation

**Process:**
1. **Application** — Submit onboarding request through your AMINA relationship manager or EasyEscrow partnership channel
2. **KYB Review** — Company documentation and beneficial ownership verified
3. **KYC Check** — Authorized users undergo identity verification
4. **Approval** — Account activated with appropriate tier (STANDARD or ENTERPRISE)
5. **Wallet Registration** — Register Solana wallets for escrow operations

**Ongoing Requirements:**
- Periodic KYC/KYB reviews
- Updated documentation for material changes
- Transaction monitoring and suspicious activity reporting

*Note: This is general information about our process. For specific onboarding inquiries, please contact your relationship manager.*`,
  },

  {
    id: 'document-requirements',
    category: 'compliance',
    patterns: [
      'what documents are required',
      'what documents do i need',
      'required documents for escrow',
      'document upload',
      'supporting documents',
      'what should i upload',
      'document types',
    ],
    keywords: ['document', 'upload', 'required', 'supporting', 'invoice', 'contract'],
    shortAnswer: `Upload supporting docs (invoices, contracts, proof of delivery) to speed up compliance. Formats: **PDF, PNG, JPG**. Up to 5 docs per escrow. Not always mandatory, but significantly speeds up review. AI auto-analyzes and cross-references with escrow details.`,
    detailedAnswer: `### Document Requirements

For each escrow transaction, you can upload supporting documents to facilitate compliance review. While not always mandatory, documents significantly speed up the compliance process.

**Recommended documents:**
- **Commercial invoice** — For trade-related payments
- **Purchase order / Sales contract** — Establishing the underlying transaction
- **Proof of delivery** — Shipping documents, bills of lading
- **Service agreement** — For service-related payments
- **Regulatory permits** — Import/export licenses if applicable

**Upload details:**
- Supported formats: PDF, PNG, JPG, JPEG
- Documents are stored securely in encrypted cloud storage
- AI analysis extracts key details and cross-references with escrow parameters
- Up to 5 documents per escrow
- Documents are retained per regulatory requirements

The more complete your documentation, the faster and smoother the compliance review.`,
  },

  {
    id: 'sanctions-screening',
    category: 'compliance',
    patterns: [
      'sanctions screening',
      'sanctions compliance',
      'ofac screening',
      'sanctions list',
      'how do you screen for sanctions',
      'sanctioned wallets',
      'aml screening',
    ],
    keywords: ['sanction', 'ofac', 'screening', 'aml', 'sanctioned', 'list'],
    shortAnswer: `Screens against **OFAC, EU, UN, and Swiss SECO** sanctions lists. Checks wallet addresses, company names, beneficial owners, and corridors. Runs at onboarding, escrow creation, and release. Uses blockchain analytics for on-chain compliance.`,
    detailedAnswer: `### Sanctions Screening

EasyEscrow implements comprehensive sanctions screening at multiple levels:

**Lists Screened:**
- **OFAC** (US Office of Foreign Assets Control) — SDN and sectoral lists
- **EU Sanctions** — Consolidated EU restrictive measures
- **UN Sanctions** — Security Council consolidated list
- **Swiss SECO** — Swiss State Secretariat for Economic Affairs sanctions

**What's Screened:**
- All counterparty wallet addresses against known sanctioned addresses
- Client company names and beneficial owners against sanctions lists
- Payment corridors and jurisdictions for embargo restrictions
- On-chain transaction patterns using blockchain analytics

**When Screening Occurs:**
- At client onboarding (KYC/KYB)
- Before each escrow creation
- Continuously during the escrow lifecycle
- At release/settlement

Blockchain analytics tools are used for on-chain compliance, detecting interactions with known illicit addresses.`,
  },

  // ═══════════════════════════════════════════════════
  // TECHNICAL / BLOCKCHAIN
  // ═══════════════════════════════════════════════════
  {
    id: 'settlement-time',
    category: 'technical',
    patterns: [
      'how fast is settlement',
      'settlement time',
      'how long does settlement take',
      'how quickly are funds released',
      'transaction speed',
      'how fast are payments',
      'payment speed',
      'time to settle',
    ],
    keywords: ['settlement', 'speed', 'fast', 'time', 'quick', 'instant', 'seconds'],
    shortAnswer: `On-chain confirmation in **~400ms**, full finality in **~13 seconds**. End-to-end happy path (create → fund → compliance → release) takes about **1 minute**. Compare: SWIFT takes 1-5 business days.`,
    detailedAnswer: `### Settlement Speed

EasyEscrow transactions settle on the Solana blockchain:

- **On-chain confirmation:** ~400ms (one Solana block)
- **Finality:** ~12 seconds for "confirmed" status
- **Full finality:** ~13 seconds for "finalized" status (32 slots)

**End-to-end timing:**
| Step | Time |
|------|------|
| Escrow creation | < 2 seconds |
| Funding confirmation | < 15 seconds |
| Compliance analysis | 5-30 seconds (AI-dependent) |
| Release/settlement | < 15 seconds |
| **Total (happy path)** | **~1 minute** |

Compare this to traditional cross-border payments:
- SWIFT wire: **1-5 business days**
- Bank letter of credit: **1-4 weeks**
- Traditional escrow services: **3-10 business days**

Solana's ~$0.01 transaction fees mean the settlement cost is negligible regardless of the payment amount.`,
  },

  {
    id: 'usdc-explained',
    category: 'technical',
    patterns: [
      'what is usdc',
      'how does usdc work',
      'why usdc',
      'usdc stablecoin',
      'is usdc safe',
      'usdc backing',
      'usdc reserves',
      'tell me about usdc',
      'why not use usdt',
    ],
    keywords: ['usdc', 'stablecoin', 'circle', 'backing', 'reserve', 'usd'],
    shortAnswer: `**USDC** is a fully-backed USD stablecoin by **Circle**. 1:1 USD backing with monthly attestations. Native on Solana as an SPL token (6 decimals). Preferred for institutional use due to transparent reserves and regulatory standing.`,
    detailedAnswer: `### USDC (USD Coin)

**USDC** is a fully-backed USD stablecoin issued by **Circle**. Each USDC is redeemable 1:1 for US dollars.

**Why EasyEscrow uses USDC:**
- **Full backing:** 100% backed by cash and short-term US Treasuries
- **Transparency:** Monthly attestations by Grant Thornton (Big Four adjacent)
- **Regulatory compliance:** Circle is a licensed money transmitter and payments company
- **Native on Solana:** USDC is issued natively as an SPL token (6 decimal precision)
- **Programmable:** Works with smart contracts/programs for automated escrow
- **24/7 availability:** No banking hours — settle anytime

**USDC on Solana specifics:**
- Mint address (mainnet): \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`
- Decimals: 6 (1 USDC = 1,000,000 base units)
- Requires an Associated Token Account (ATA) in your wallet

**USDC vs USDT:**
USDC is preferred for institutional use due to its transparent reserves and regulatory standing. USDT (Tether) has a larger market cap but less transparent backing and has faced regulatory scrutiny.`,
  },

  {
    id: 'wallet-setup',
    category: 'technical',
    patterns: [
      'how do i set up a wallet',
      'wallet requirements',
      'what wallet do i need',
      'supported wallets',
      'how to connect wallet',
      'phantom wallet',
      'solana wallet',
      'register a wallet',
      'add a wallet',
    ],
    keywords: ['wallet', 'phantom', 'setup', 'connect', 'register', 'solana', 'add'],
    shortAnswer: `You need a **Solana wallet** (Phantom recommended) with USDC and a small SOL balance (~0.01 SOL for fees). Register your wallet address through the institution portal. Only registered wallets can create/fund escrows.`,
    detailedAnswer: `### Wallet Setup

EasyEscrow operates on the **Solana blockchain**, so you need a Solana-compatible wallet.

**Supported wallets:**
- **Phantom** — Most popular Solana wallet (recommended)
- Any Solana wallet that supports SPL tokens and transaction signing

**Requirements:**
1. **Solana wallet** with a valid public key
2. **USDC token account** — Your wallet needs an Associated Token Account (ATA) for USDC
3. **Small SOL balance** — For transaction fees (~0.01 SOL is sufficient)
4. **Wallet registered** — Your wallet address must be registered with your EasyEscrow institution account

**Steps:**
1. Install or open your Solana wallet (e.g., Phantom browser extension)
2. Ensure you have USDC and a small amount of SOL in the wallet
3. Register the wallet address through the institution portal
4. The wallet is now ready for escrow operations

**Important:** Only use wallets registered to your institution account. Transactions from unregistered wallets will be rejected.`,
  },

  {
    id: 'security',
    category: 'technical',
    patterns: [
      'how secure is easyescrow',
      'is it safe',
      'security measures',
      'how are funds protected',
      'smart contract security',
      'is my money safe',
      'escrow security',
      'how do you protect funds',
    ],
    keywords: ['secure', 'security', 'safe', 'protect', 'fund', 'smart', 'contract', 'audit'],
    shortAnswer: `Funds are held in **on-chain PDAs** controlled by the Solana program — not any individual. All transactions are atomic (all-or-nothing). Settlement requires a separate authorized key. JWT auth, rate limiting, PII anonymization, encrypted storage, and allowlist-only registration.`,
    detailedAnswer: `### Security

EasyEscrow employs multiple layers of security:

**On-Chain Security:**
- **Solana program (smart contract)** governs all escrow operations
- Funds are held in Program Derived Addresses (PDAs) — controlled by the program, not any individual
- **Settlement authority pattern** — release requires a separate authorized key
- All transactions are atomic — they either complete fully or revert entirely
- Immutable audit trail on the Solana blockchain

**Application Security:**
- JWT-based authentication with sliding session renewal
- Rate limiting on all endpoints (API + AI chat)
- PII anonymization — sensitive data is tokenized before reaching AI services
- Encrypted document storage (DigitalOcean Spaces with server-side encryption)
- Allowlist-based institution registration (not open signup)

**Compliance Security:**
- AI-powered transaction monitoring
- Sanctions screening at multiple checkpoints
- Risk scoring for every transaction
- Complete audit logging of all state changes
- Regulatory-compliant data retention

**Operational Security:**
- Deployed on DigitalOcean App Platform with managed infrastructure
- PostgreSQL with automated backups
- Redis for session management with secure connections
- Environment-specific configurations (dev/staging/production)`,
  },

  {
    id: 'transaction-failed',
    category: 'technical',
    patterns: [
      'what happens if a transaction fails',
      'failed transaction',
      'transaction error',
      'payment failed',
      'what if something goes wrong',
      'escrow failed',
      'error during payment',
    ],
    keywords: ['fail', 'failed', 'error', 'wrong', 'problem', 'issue', 'transaction'],
    shortAnswer: `Rare on Solana. If funding fails — USDC stays in your wallet, retry anytime. If release fails — funds stay safely in the escrow PDA (never lost). Solana's atomic model means funds are never in limbo. Check the escrow audit log for details.`,
    detailedAnswer: `### Failed Transactions

Transaction failures are rare on EasyEscrow, but here's how they're handled:

**During Funding:**
- If the funding transaction fails on-chain, the escrow remains in CREATED status
- Your USDC stays in your wallet — nothing is deducted
- You can retry funding or cancel the escrow

**During Release:**
- If the release transaction fails, the escrow moves to FAILED status
- Funds remain safely in the escrow PDA (not lost)
- The platform team can investigate and retry the release
- If unresolvable, funds are refunded to the payer

**Common Causes:**
- Insufficient SOL for transaction fees (need ~0.01 SOL)
- Network congestion (rare on Solana)
- Recipient wallet doesn't have a USDC token account
- Escrow has expired during processing

**What to do:**
1. Check the escrow status in your dashboard
2. Review the audit log for error details
3. If the issue persists, contact support with the escrow code

Solana's atomic transaction model means funds are never in a "limbo" state — they're either in your wallet, in the escrow, or delivered to the recipient.`,
  },

  // ═══════════════════════════════════════════════════
  // ACCOUNT & TIERS
  // ═══════════════════════════════════════════════════
  {
    id: 'client-tiers',
    category: 'account',
    patterns: [
      'what are the client tiers',
      'standard vs enterprise',
      'tier differences',
      'what tier am i',
      'upgrade to enterprise',
      'enterprise features',
      'account tiers',
    ],
    keywords: ['tier', 'standard', 'enterprise', 'upgrade', 'level', 'account'],
    shortAnswer: `Two tiers: **STANDARD** (default) and **ENTERPRISE**. Both get escrow creation, AI compliance, document uploads, and API access. Enterprise adds custom limits, custom expiry, priority support, and a dedicated account manager. Contact your relationship manager to upgrade.`,
    detailedAnswer: `### Client Tiers

EasyEscrow offers two tiers for institutional clients:

| Feature | STANDARD | ENTERPRISE |
|---------|----------|------------|
| Escrow creation | ✅ | ✅ |
| AI compliance analysis | ✅ | ✅ |
| Document uploads | ✅ | ✅ |
| API access | ✅ | ✅ |
| AI Chat assistant | ✅ | ✅ |
| Custom escrow limits | — | ✅ |
| Custom expiry windows | — | ✅ |
| Priority support | — | ✅ |
| Dedicated account manager | — | ✅ |

**Upgrading to Enterprise:**
Contact your relationship manager or account manager to discuss Enterprise tier access. Upgrades are based on transaction volume and institutional requirements.`,
  },

  // ═══════════════════════════════════════════════════
  // COMPARISONS
  // ═══════════════════════════════════════════════════
  {
    id: 'swift-comparison',
    category: 'comparison',
    patterns: [
      'how does this compare to swift',
      'swift vs easyescrow',
      'comparison with wire transfer',
      'why not use swift',
      'traditional payment comparison',
      'compare to bank transfer',
      'advantages over swift',
      'why use stablecoins instead of swift',
      'wire transfer comparison',
    ],
    keywords: [
      'swift',
      'wire',
      'transfer',
      'compare',
      'comparison',
      'traditional',
      'bank',
      'advantage',
    ],
    shortAnswer: `**EasyEscrow:** 0.20% fee, settles in seconds, 24/7, no intermediaries. **SWIFT:** 1-3% + $25-50 fees, 1-5 business days, banking hours only, 1-4 correspondent banks. Up to **90% cheaper** and **orders of magnitude faster**.`,
    detailedAnswer: `### EasyEscrow vs Traditional Cross-Border Payments

| Feature | EasyEscrow (USDC) | SWIFT Wire Transfer |
|---------|-------------------|---------------------|
| **Settlement time** | Seconds | 1-5 business days |
| **Cost** | 0.20% platform fee | 1-3% + $25-50 fixed fees |
| **Availability** | 24/7/365 | Banking hours only |
| **Transparency** | Real-time on-chain tracking | Opaque, status updates delayed |
| **Intermediaries** | None (peer-to-peer on-chain) | 1-4 correspondent banks |
| **Currency risk** | None (USDC = USD) | FX conversion at each hop |
| **Minimum amount** | $10 | Typically $1,000+ |
| **Compliance** | AI-automated, seconds | Manual review, days-weeks |
| **Audit trail** | Immutable blockchain record | Bank statements (delayed) |
| **Escrow capability** | Built-in, programmable | Separate escrow service needed |

**Key advantages of stablecoin payments:**
1. **Speed** — Settlement in seconds, not days
2. **Cost** — Up to 90% cheaper than traditional methods
3. **Transparency** — Track every step on the blockchain
4. **Programmability** — Automated escrow with built-in compliance
5. **No intermediaries** — Direct settlement without correspondent banks
6. **No FX risk** — USD-denominated throughout`,
  },

  // ═══════════════════════════════════════════════════
  // YIELD / SOLSTICE
  // ═══════════════════════════════════════════════════
  {
    id: 'solstice-yield',
    category: 'yield',
    patterns: [
      'what is solstice',
      'solstice yield',
      'stablecoin yield',
      'earn yield on usdc',
      'yield on idle funds',
      'how does yield work',
      'can i earn interest',
      'solstice integration',
    ],
    keywords: ['solstice', 'yield', 'earn', 'interest', 'idle', 'return'],
    shortAnswer: `**Solstice** is EasyEscrow's planned yield integration for idle USDC. Institutional-grade strategies with transparent reporting. Currently in development — details on returns and eligibility will be announced at launch.`,
    detailedAnswer: `### Solstice Yield

**Solstice** is EasyEscrow's planned integration for earning yield on stablecoin holdings.

**Concept:**
- Institutional-grade yield strategies for idle USDC
- Risk-adjusted returns with transparent reporting
- Integration between escrow and yield — earn while funds are in escrow
- No lock-up periods for escrowed funds (must remain available for release)

**Status:** Solstice yield integration is currently in development. Details on available strategies, expected returns, and eligibility will be announced when the feature launches.

*Note: This is general information about a planned feature. It does not constitute financial advice or a guarantee of returns.*`,
  },

  // ═══════════════════════════════════════════════════
  // AMINA GROUP
  // ═══════════════════════════════════════════════════
  {
    id: 'amina-group',
    category: 'platform',
    patterns: [
      'what is amina group',
      'who is amina',
      'amina bank',
      'seba bank',
      'tell me about amina',
      'banking partner',
      'who provides banking services',
      'crypto bank partner',
    ],
    keywords: ['amina', 'seba', 'bank', 'partner', 'finma', 'swiss'],
    shortAnswer: `**AMINA Group** (formerly SEBA Bank) is a FINMA-licensed Swiss crypto bank in Zug. Provides custody, fiat on/off ramp, trading, and staking for institutional clients. Acts as the regulated banking bridge between on-chain stablecoin transfers and traditional banking.`,
    detailedAnswer: `### AMINA Group (formerly SEBA Bank)

**AMINA Group AG** (rebranded from SEBA Bank AG in October 2023) is a FINMA-licensed Swiss bank specializing in digital assets and traditional financial services.

**Key facts:**
- Founded in 2018, received FINMA banking license in August 2019
- Headquartered in Zug, Switzerland
- One of the first fully regulated crypto banks globally
- Member of the Swiss Bankers Association (SBA)

**Services relevant to EasyEscrow:**
- **Custody** — Institutional-grade custody for digital assets including USDC
- **Fiat on/off ramp** — Conversion between fiat (CHF, EUR, USD, SGD, HKD) and digital assets
- **Trading** — OTC and exchange trading for crypto assets
- **Staking** — Institutional staking services for Solana and other PoS networks
- **Banking** — Full Swiss banking services including multi-currency accounts

**Role in cross-border payments:**
AMINA provides the regulated banking rails for institutional stablecoin settlement. Clients can hold USDC in AMINA custody and settle via Swiss banking infrastructure, with FINMA-compliant AML/KYC throughout.`,
  },

  // ═══════════════════════════════════════════════════
  // REGULATIONS
  // ═══════════════════════════════════════════════════
  {
    id: 'regulations-overview',
    category: 'compliance',
    patterns: [
      'what regulations apply',
      'regulatory framework',
      'is this regulated',
      'legal framework',
      'compliance framework',
      'what laws govern this',
      'regulatory compliance',
      'is stablecoin payment regulated',
    ],
    keywords: [
      'regulation',
      'regulatory',
      'law',
      'legal',
      'framework',
      'governed',
      'comply',
      'compliance',
    ],
    shortAnswer: `Compliant with **Swiss AMLA**, **FATF Travel Rule**, **EU MiCA**, **Singapore PSA**, and **OFAC/EU/UN sanctions**. Allowlist-only onboarding with KYC/KYB, automated sanctions screening, AI risk scoring, and complete audit trails. Banking partner AMINA provides FINMA-regulated infrastructure.`,
    detailedAnswer: `### Regulatory Framework

EasyEscrow operates within a comprehensive regulatory framework:

**Key Regulations:**

| Regulation | Jurisdiction | Relevance |
|------------|-------------|-----------|
| **Swiss AMLA** | Switzerland | AML obligations for virtual asset intermediaries |
| **Swiss DLT Framework** | Switzerland | Legal framework for DLT-based assets |
| **FATF Travel Rule** | Global | Originator/beneficiary info for transfers >$1,000 |
| **EU MiCA** | European Union | Crypto-asset service provider requirements |
| **Singapore PSA** | Singapore | Digital Payment Token service regulation |
| **OFAC/EU/UN Sanctions** | Global | Sanctions screening requirements |

**How EasyEscrow complies:**
- Allowlist-based onboarding with KYC/KYB verification
- Automated sanctions screening at multiple checkpoints
- AI-powered transaction monitoring and risk scoring
- Complete audit trails on-chain and off-chain
- FATF Travel Rule data collection for all transfers
- Document retention per regulatory requirements
- Banking partner (AMINA Group) provides FINMA-regulated infrastructure

*Note: This is educational information about the regulatory landscape. It does not constitute legal advice. Consult your compliance team for jurisdiction-specific requirements.*`,
  },

  {
    id: 'travel-rule',
    category: 'compliance',
    patterns: [
      'what is the travel rule',
      'fatf travel rule',
      'travel rule requirements',
      'travel rule compliance',
      'originator beneficiary information',
    ],
    keywords: ['travel', 'rule', 'fatf', 'originator', 'beneficiary'],
    shortAnswer: `Requires originator and beneficiary info for transfers above **$1,000**. EasyEscrow collects all required Travel Rule data during escrow creation and validates completeness via AI compliance analysis.`,
    detailedAnswer: `### FATF Travel Rule

The **FATF Travel Rule** requires Virtual Asset Service Providers (VASPs) to exchange originator and beneficiary information for virtual asset transfers above **$1,000**.

**Required Information:**
- **Originator:** Name, account number/wallet address, physical address (or national ID, date of birth, or place of birth)
- **Beneficiary:** Name, account number/wallet address

**How EasyEscrow handles it:**
- All required Travel Rule data is collected during escrow creation
- Institution client KYC/KYB provides the originator information
- Beneficiary details are verified against registered institution records
- Data is stored securely and made available for regulatory inquiries
- Automated compliance analysis validates Travel Rule completeness

This applies to all cross-border stablecoin transfers processed through the platform.`,
  },

  // ═══════════════════════════════════════════════════
  // GENERAL / META
  // ═══════════════════════════════════════════════════
  {
    id: 'what-can-you-do',
    category: 'platform',
    patterns: [
      'what can you do',
      'what can you help with',
      'how can you help me',
      'what are your capabilities',
      'help',
      'what do you know',
      'what can i ask you',
    ],
    keywords: ['help', 'can', 'do', 'capability', 'know', 'ask'],
    shortAnswer: `I can **look up your escrows and account**, explain platform features (fees, limits, corridors), cover compliance and regulations, and discuss USDC/Solana technical topics. Just ask a question or say *"show me my escrows"*.`,
    detailedAnswer: `### How I Can Help

I'm the **EasyEscrow AI Assistant**. Here's what I can do:

**📊 Your Account & Escrows**
- Look up specific escrows by code (e.g., *"show me EE-ABC-123"*)
- Search escrows by status, corridor, or amount range
- Show your account summary and dashboard stats

**💡 Platform Knowledge**
- Explain how escrow works, fees, limits, and corridors
- Walk through the escrow lifecycle and compliance process
- Compare EasyEscrow to traditional payment methods

**🔒 Compliance & Regulations**
- Explain compliance checks, risk scoring, and document requirements
- Cover regulatory frameworks (FATF, MiCA, Swiss AMLA, etc.)
- Describe KYC/KYB onboarding and sanctions screening

**⛓️ Technical Topics**
- USDC and stablecoin mechanics on Solana
- Wallet setup and requirements
- Settlement times and security architecture

**Just ask a question** and I'll either answer from my knowledge or look up your specific data from the platform.`,
  },

  {
    id: 'atomic-swaps',
    category: 'platform',
    patterns: [
      'what are atomic swaps',
      'nft swaps',
      'how do atomic swaps work',
      'nft trading',
      'peer to peer trading',
      'p2p nft',
      'swap nfts',
    ],
    keywords: ['atomic', 'swap', 'nft', 'peer', 'p2p', 'trading'],
    shortAnswer: `Trustless peer-to-peer NFT/SOL exchanges on Solana. Supports NFT↔SOL, NFT↔NFT, cNFT↔SOL, and bulk swaps (up to 4 NFTs). All-or-nothing execution — both sides complete or neither does. Fees paid in SOL. *Separate from institution escrow (USDC).*`,
    detailedAnswer: `### Atomic Swaps

EasyEscrow's **atomic swap** system enables trustless peer-to-peer NFT and SOL exchanges on Solana.

**Supported swap types:**
- **NFT ↔ SOL** — Trade an NFT for SOL
- **NFT ↔ NFT** — Trade NFTs directly
- **cNFT ↔ SOL** — Trade compressed NFTs for SOL
- **Bulk swaps** — Up to 4 NFTs total per swap

**How it works:**
1. One party creates a swap offer specifying what they're giving and what they want
2. The counterparty reviews and accepts the offer
3. Transactions are built and executed atomically — both sides complete or neither does
4. For multi-NFT swaps, Jito bundles ensure all transactions execute together

**Key features:**
- **Trustless:** No intermediary holds assets — the on-chain program controls the swap
- **Atomic:** All-or-nothing execution — no risk of partial completion
- **Low cost:** All fees paid in native SOL
- **cNFT support:** Full support for compressed NFTs with Merkle proof handling

*Note: Atomic swaps use SOL for all fees and payments. The institution escrow system (USDC) is a separate product.*`,
  },

  {
    id: 'create-escrow-how',
    category: 'platform',
    patterns: [
      'how do i create an escrow',
      'create a new escrow',
      'start an escrow',
      'initiate a payment',
      'how to send a payment',
      'make a payment',
      'new escrow',
      'create payment',
    ],
    keywords: ['create', 'new', 'start', 'initiate', 'send', 'make', 'payment'],
    shortAnswer: `Go to **Escrows → Create New Escrow** in the portal. Enter amount (USDC), recipient wallet, corridor, and conditions. Review the 0.20% fee and confirm. You'll get an escrow code (\`EE-XXX-XXX\`). Then fund it from your registered wallet.`,
    detailedAnswer: `### Creating an Escrow

To create a new institution escrow payment:

**Via the Portal Dashboard:**
1. Navigate to the **Escrows** section
2. Click **"Create New Escrow"**
3. Fill in the details:
   - **Amount** (USDC) — within corridor limits
   - **Recipient wallet** — the Solana wallet to receive funds
   - **Payment corridor** — the route (e.g., SG-CH)
   - **Condition type** — payment terms
4. Review the platform fee (0.20% of amount)
5. Confirm creation — an on-chain escrow PDA is generated
6. You'll receive an escrow code (e.g., \`EE-ABC-123\`)

**Next steps after creation:**
- **Fund** the escrow by sending USDC from your registered wallet
- **Upload** supporting documents (invoices, contracts) for compliance
- **Monitor** the escrow status through the dashboard or ask me

**Requirements:**
- Active institution account with KYC/KYB approved
- Registered Solana wallet with sufficient USDC
- Small SOL balance for transaction fees (~0.01 SOL)`,
  },

  {
    id: 'cancel-escrow',
    category: 'platform',
    patterns: [
      'how do i cancel an escrow',
      'cancel a payment',
      'can i cancel',
      'cancel escrow',
      'refund escrow',
      'get my money back',
      'cancel and refund',
      'how to cancel',
    ],
    keywords: ['cancel', 'refund', 'back', 'undo', 'reverse', 'return'],
    shortAnswer: `Cancel anytime **before release** (CREATED, FUNDED, or COMPLIANCE_HOLD status). Funded USDC is refunded to your payer wallet in **seconds**. No platform fee on cancelled escrows. Can't cancel once RELEASING or RELEASED.`,
    detailedAnswer: `### Cancelling an Escrow

You can cancel an escrow and receive a refund **before it has been released**.

**When you can cancel:**
- ✅ Status: CREATED (not yet funded) — cancel freely
- ✅ Status: FUNDED — cancel and receive full USDC refund
- ✅ Status: COMPLIANCE_HOLD — cancel and receive full USDC refund
- ❌ Status: RELEASING — too late, release is in progress
- ❌ Status: RELEASED — already completed
- ❌ Status: CANCELLED/EXPIRED — already resolved

**How to cancel:**
1. Find the escrow in your dashboard or ask me for details
2. Click **"Cancel"** on the escrow detail page
3. Confirm the cancellation
4. If funded, USDC is refunded to your payer wallet on-chain
5. Status changes to CANCELLING → CANCELLED

**Refund timing:**
- On-chain refund processes in **seconds**
- USDC returns to the same wallet that funded the escrow
- Platform fee is not charged on cancelled escrows`,
  },
];
