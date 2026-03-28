/**
 * Staging Auth Helper
 *
 * Authenticates against the staging API and returns a JWT token.
 * Uses seeded institution credentials.
 */

const STAGING_API = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
const STAGING_EMAIL = process.env.STAGING_EMAIL || 'ops@globaltrade-industries.com';
const STAGING_PASSWORD = process.env.STAGING_PASSWORD || 'change-me';

export interface StagingAuthResult {
  accessToken: string;
  clientId: string;
  email: string;
  tier: string;
  primaryWallet: string;
}

/**
 * Login to staging API and return auth details.
 * Caches the token for the duration of the test run.
 */
let cachedAuth: StagingAuthResult | null = null;

export async function getStagingAuth(): Promise<StagingAuthResult> {
  if (cachedAuth) return cachedAuth;

  const res = await fetch(`${STAGING_API}/api/v1/institution/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STAGING_EMAIL, password: STAGING_PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Staging login failed (${res.status}): ${body}`);
  }

  const data: any = await res.json();

  cachedAuth = {
    accessToken: data.data.tokens.accessToken,
    clientId: data.data.client.id,
    email: data.data.client.email,
    tier: data.data.client.tier,
    primaryWallet: data.data.client.primaryWallet,
  };

  return cachedAuth;
}

export function getStagingApiUrl(): string {
  return STAGING_API;
}

export function clearAuthCache(): void {
  cachedAuth = null;
}

/**
 * Generate a unique label for test meta-addresses to avoid unique constraint collisions.
 */
export function uniqueLabel(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Helper for making authenticated requests to staging.
 */
export async function stagingFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const auth = await getStagingAuth();
  const url = `${getStagingApiUrl()}${path}`;

  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      ...(options.headers || {}),
    },
  });
}
