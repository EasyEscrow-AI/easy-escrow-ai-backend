-- Add new statuses to InstitutionEscrowStatus enum
ALTER TYPE "InstitutionEscrowStatus" ADD VALUE IF NOT EXISTS 'INSUFFICIENT_FUNDS';
ALTER TYPE "InstitutionEscrowStatus" ADD VALUE IF NOT EXISTS 'COMPLETE';
