export const testClients = {
  active: {
    email: 'active@test.com',
    tier: 'STANDARD',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
  },
  enterprise: {
    email: 'enterprise@test.com',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
  },
  suspended: {
    email: 'suspended@test.com',
    tier: 'STANDARD',
    status: 'SUSPENDED',
    kycStatus: 'VERIFIED',
  },
  pending: {
    email: 'pending@test.com',
    tier: 'STANDARD',
    status: 'PENDING_VERIFICATION',
    kycStatus: 'PENDING',
  },
};

export const testPasswords = {
  valid: 'SecurePass123!',
  weak: 'weak',
  noSpecial: 'Password123',
  noUpper: 'password123!',
};

export const testTokens = {
  expired:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRJZCI6InRlc3QiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJ0aWVyIjoiU1RBTkRBUkQiLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDkwMH0.invalid',
};
