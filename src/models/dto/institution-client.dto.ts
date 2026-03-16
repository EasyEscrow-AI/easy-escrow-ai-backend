import {
  InstitutionClientRecord,
  AuthTokens,
  ClientSettings,
} from '../../types/institution-client';

/**
 * Document types supported for file uploads.
 */
export enum DocumentType {
  INVOICE = 'INVOICE',
  CONTRACT = 'CONTRACT',
  SHIPPING_DOC = 'SHIPPING_DOC',
  LETTER_OF_CREDIT = 'LETTER_OF_CREDIT',
  OTHER = 'OTHER',
}

// --- Auth DTOs ---

/**
 * Request DTO for client registration.
 */
export interface RegisterRequest {
  email: string;
  password: string;
  companyName: string;
}

/**
 * Request DTO for client login.
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Response DTO after successful authentication.
 */
export interface AuthResponse {
  client: InstitutionClientRecord;
  tokens: AuthTokens;
}

/**
 * Request DTO for refreshing an access token.
 */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/**
 * Request DTO for changing a client password.
 */
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

// --- Settings DTOs ---

/**
 * Request DTO for updating client settings (all fields optional).
 */
export interface UpdateSettingsRequest extends Partial<Omit<ClientSettings, 'clientId'>> {}

/**
 * Request DTO for updating wallet addresses.
 */
export interface UpdateWalletsRequest {
  primaryWallet?: string;
  settlementWallet?: string;
}

// --- API Key DTOs ---

/**
 * Request DTO for generating a new API key.
 */
export interface GenerateApiKeyRequest {
  name: string;
  permissions: string[];
}

/**
 * Response DTO for an API key. The `key` field is only present on creation.
 */
export interface ApiKeyResponse {
  id: string;
  name: string;
  /** Full key value, only returned once on creation */
  key?: string;
  permissions: string[];
  active: boolean;
  lastUsedAt: Date | null;
}

// --- File DTOs ---

/**
 * Request DTO for uploading a document.
 */
export interface UploadFileRequest {
  documentType: DocumentType;
}

/**
 * Response DTO for an uploaded file.
 */
export interface FileResponse {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  documentType: DocumentType;
  uploadedAt: Date;
  url?: string;
}
