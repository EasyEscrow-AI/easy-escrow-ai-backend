import { isValidSolanaAddress } from './solana.validator';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Password strength rules:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character
 */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]).{8,}$/;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COMPANY_NAME_MIN = 2;
const COMPANY_NAME_MAX = 200;

/**
 * Validate password strength and return a descriptive error if invalid.
 */
const validatePasswordStrength = (password: string, field: string): ValidationError | null => {
  if (!password || typeof password !== 'string') {
    return { field, message: `${field} is required` };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      field,
      message: `${field} must be at least ${PASSWORD_MIN_LENGTH} characters`,
    };
  }
  if (!PASSWORD_REGEX.test(password)) {
    return {
      field,
      message: `${field} must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character`,
    };
  }
  return null;
};

/**
 * Validate a Solana wallet address (base58, 32-44 chars).
 */
const isValidWallet = (address: string): boolean => {
  if (!address || typeof address !== 'string') return false;
  if (address.length < 32 || address.length > 44) return false;
  return isValidSolanaAddress(address);
};

/**
 * Validate client registration request.
 */
export const validateRegister = (data: {
  email?: string;
  password?: string;
  companyName?: string;
}): ValidationError[] => {
  const errors: ValidationError[] = [];

  // email
  if (!data.email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!EMAIL_REGEX.test(data.email)) {
    errors.push({ field: 'email', message: 'Invalid email address' });
  }

  // password
  const passwordError = validatePasswordStrength(data.password || '', 'password');
  if (passwordError) {
    errors.push(passwordError);
  }

  // companyName
  if (!data.companyName) {
    errors.push({ field: 'companyName', message: 'Company name is required' });
  } else if (data.companyName.length < COMPANY_NAME_MIN) {
    errors.push({
      field: 'companyName',
      message: `Company name must be at least ${COMPANY_NAME_MIN} characters`,
    });
  } else if (data.companyName.length > COMPANY_NAME_MAX) {
    errors.push({
      field: 'companyName',
      message: `Company name must not exceed ${COMPANY_NAME_MAX} characters`,
    });
  }

  return errors;
};

/**
 * Validate client login request.
 */
export const validateLogin = (data: { email?: string; password?: string }): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!data.email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!EMAIL_REGEX.test(data.email)) {
    errors.push({ field: 'email', message: 'Invalid email address' });
  }

  if (!data.password) {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  return errors;
};

/**
 * Validate change password request.
 */
export const validateChangePassword = (data: {
  oldPassword?: string;
  newPassword?: string;
}): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!data.oldPassword) {
    errors.push({ field: 'oldPassword', message: 'Current password is required' });
  }

  const newPasswordError = validatePasswordStrength(data.newPassword || '', 'newPassword');
  if (newPasswordError) {
    errors.push(newPasswordError);
  }

  if (data.oldPassword && data.newPassword && data.oldPassword === data.newPassword) {
    errors.push({
      field: 'newPassword',
      message: 'New password must be different from current password',
    });
  }

  return errors;
};

/**
 * Validate update settings request (all fields optional).
 */
export const validateUpdateSettings = (data: Record<string, unknown>): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (data.defaultCorridor !== undefined && data.defaultCorridor !== null) {
    if (typeof data.defaultCorridor !== 'string') {
      errors.push({ field: 'defaultCorridor', message: 'Default corridor must be a string' });
    } else if (!/^[A-Z]{2}-[A-Z]{2}$/.test(data.defaultCorridor)) {
      errors.push({
        field: 'defaultCorridor',
        message: 'Default corridor must be in XX-XX format (e.g. SG-CH)',
      });
    }
  }

  if (data.defaultCurrency !== undefined) {
    if (typeof data.defaultCurrency !== 'string' || data.defaultCurrency.length < 2) {
      errors.push({
        field: 'defaultCurrency',
        message: 'Default currency must be a valid currency code',
      });
    }
  }

  if (data.notificationEmail !== undefined && data.notificationEmail !== null) {
    if (typeof data.notificationEmail !== 'string' || !EMAIL_REGEX.test(data.notificationEmail)) {
      errors.push({ field: 'notificationEmail', message: 'Invalid notification email address' });
    }
  }

  if (data.webhookUrl !== undefined && data.webhookUrl !== null) {
    if (typeof data.webhookUrl !== 'string') {
      errors.push({ field: 'webhookUrl', message: 'Webhook URL must be a string' });
    } else {
      try {
        const url = new URL(data.webhookUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push({ field: 'webhookUrl', message: 'Webhook URL must use HTTP or HTTPS' });
        }
      } catch {
        errors.push({ field: 'webhookUrl', message: 'Invalid webhook URL' });
      }
    }
  }

  if (data.timezone !== undefined) {
    if (typeof data.timezone !== 'string' || data.timezone.length < 2) {
      errors.push({ field: 'timezone', message: 'Invalid timezone' });
    }
  }

  if (data.autoApproveThreshold !== undefined && data.autoApproveThreshold !== null) {
    if (
      typeof data.autoApproveThreshold !== 'number' ||
      !Number.isFinite(data.autoApproveThreshold) ||
      data.autoApproveThreshold < 0
    ) {
      errors.push({
        field: 'autoApproveThreshold',
        message: 'Auto-approve threshold must be a non-negative number',
      });
    }
  }

  if (data.settlementAuthorityWallet !== undefined && data.settlementAuthorityWallet !== null) {
    if (!isValidWallet(data.settlementAuthorityWallet as string)) {
      errors.push({
        field: 'settlementAuthorityWallet',
        message: 'Invalid settlement authority wallet address',
      });
    }
  }

  return errors;
};

/**
 * Validate wallet update request.
 */
export const validateUpdateWallets = (data: {
  primaryWallet?: string;
  settlementWallet?: string;
}): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (data.primaryWallet !== undefined) {
    if (!isValidWallet(data.primaryWallet)) {
      errors.push({ field: 'primaryWallet', message: 'Invalid primary wallet address' });
    }
  }

  if (data.settlementWallet !== undefined) {
    if (!isValidWallet(data.settlementWallet)) {
      errors.push({
        field: 'settlementWallet',
        message: 'Invalid settlement wallet address',
      });
    }
  }

  if (!data.primaryWallet && !data.settlementWallet) {
    errors.push({
      field: 'primaryWallet',
      message: 'At least one wallet address must be provided',
    });
  }

  return errors;
};
