/**
 * Data Anonymizer — Reversible tokenization for AI analysis
 *
 * Replaces sensitive values with deterministic tokens before sending to AI models,
 * then de-anonymizes the AI response so the client sees real values.
 *
 * Example:
 *   Input:  { companyName: "Acme Corp", country: "SG" }
 *   Tokens: { companyName: "[COMPANY_1]", country: "SG" }  (country kept for corridor analysis)
 *   AI says: "[COMPANY_1] is a low-risk entity..."
 *   Output: "Acme Corp is a low-risk entity..."
 *
 * Usage:
 *   const anonymizer = new DataAnonymizer();
 *   const tokenized = anonymizer.anonymizeObject(data, ESCROW_SENSITIVE_FIELDS);
 *   // ... send tokenized to AI ...
 *   const result = anonymizer.deanonymizeResult(aiResult);
 */

export type FieldCategory =
  | 'COMPANY'
  | 'PERSON'
  | 'EMAIL'
  | 'PHONE'
  | 'ADDRESS'
  | 'ACCOUNT'
  | 'WALLET'
  | 'DOCUMENT'
  | 'REFERENCE';

/** Map of field paths to their anonymization category */
export type SensitiveFieldMap = Record<string, FieldCategory>;

/** Sensitive fields for escrow analysis */
export const ESCROW_SENSITIVE_FIELDS: SensitiveFieldMap = {
  'client.companyName': 'COMPANY',
  'client.legalName': 'COMPANY',
  'client.tradingName': 'COMPANY',
  'payerWallet': 'WALLET',
  'recipientWallet': 'WALLET',
  'settlementAuthority': 'WALLET',
  'escrowPda': 'WALLET',
  'vaultPda': 'WALLET',
  'depositTxSignature': 'REFERENCE',
  'releaseTxSignature': 'REFERENCE',
};

/** Sensitive fields for client analysis */
export const CLIENT_SENSITIVE_FIELDS: SensitiveFieldMap = {
  'companyName': 'COMPANY',
  'legalName': 'COMPANY',
  'tradingName': 'COMPANY',
  'contactFirstName': 'PERSON',
  'contactLastName': 'PERSON',
  'contactEmail': 'EMAIL',
  'contactPhone': 'PHONE',
  'addressLine1': 'ADDRESS',
  'addressLine2': 'ADDRESS',
  'city': 'ADDRESS',
  'postalCode': 'ADDRESS',
  'primaryWallet': 'WALLET',
  'accountManagerName': 'PERSON',
  'accountManagerEmail': 'EMAIL',
  'custodianName': 'COMPANY',
  'taxId': 'ACCOUNT',
  'registrationNumber': 'ACCOUNT',
  'lei': 'ACCOUNT',
  'licenseNumber': 'ACCOUNT',
};

export class DataAnonymizer {
  private tokenMap = new Map<string, string>();   // original value -> token
  private reverseMap = new Map<string, string>();  // token -> original value
  private counters = new Map<FieldCategory, number>();

  /**
   * Generate a deterministic token for a value.
   * Same value always maps to the same token within one anonymizer instance.
   */
  tokenize(value: string, category: FieldCategory): string {
    if (!value || value.trim() === '') return value;

    // Return existing token if this exact value was already seen
    const existing = this.tokenMap.get(value);
    if (existing) return existing;

    const count = (this.counters.get(category) || 0) + 1;
    this.counters.set(category, count);

    const token = `[${category}_${count}]`;
    this.tokenMap.set(value, token);
    this.reverseMap.set(token, value);

    return token;
  }

  /**
   * Anonymize an object by replacing sensitive field values with tokens.
   * Returns a deep copy — original object is not modified.
   */
  anonymizeObject(data: Record<string, unknown>, sensitiveFields: SensitiveFieldMap): Record<string, unknown> {
    const copy = structuredClone(data);

    for (const [fieldPath, category] of Object.entries(sensitiveFields)) {
      const value = getNestedValue(copy, fieldPath);
      if (typeof value === 'string' && value.trim()) {
        const token = this.tokenize(value, category);
        setNestedValue(copy, fieldPath, token);
      }
    }

    return copy;
  }

  /**
   * Anonymize free text by replacing known sensitive values with their tokens.
   * Uses the existing tokenMap built from prior anonymizeObject calls.
   */
  anonymizeText(text: string): string {
    let result = text;
    // Sort by value length descending to avoid partial replacements
    const entries = [...this.tokenMap.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [original, token] of entries) {
      // Only replace if the value is substantial (skip very short strings)
      if (original.length >= 3) {
        result = result.split(original).join(token);
      }
    }
    return result;
  }

  /**
   * De-anonymize a string by replacing all tokens with original values.
   */
  deanonymizeText(text: string): string {
    if (!text) return text;
    let result = text;
    for (const [token, original] of this.reverseMap.entries()) {
      result = result.split(token).join(original);
    }
    return result;
  }

  /**
   * De-anonymize an AiAnalysisResult — restores tokens in all string fields.
   */
  deanonymizeResult<T>(result: T): T {
    const copy = JSON.parse(JSON.stringify(result));
    this.deanonymizeObjectRecursive(copy);
    return copy;
  }

  /**
   * Get the token map (for debugging / audit trail).
   * Returns { token -> original } pairs.
   */
  getTokenMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [token, original] of this.reverseMap.entries()) {
      map[token] = original;
    }
    return map;
  }

  /**
   * Get count of anonymized values.
   */
  get tokenCount(): number {
    return this.tokenMap.size;
  }

  // ─── Private ──────────────────────────────────────────────────

  private deanonymizeObjectRecursive(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          obj[i] = this.deanonymizeText(obj[i]);
        } else {
          this.deanonymizeObjectRecursive(obj[i]);
        }
      }
      return;
    }

    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = this.deanonymizeText(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.deanonymizeObjectRecursive(obj[key]);
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function getNestedValue(obj: any, path: string): unknown {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function setNestedValue(obj: any, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] == null || typeof current[parts[i]] !== 'object') return;
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}
