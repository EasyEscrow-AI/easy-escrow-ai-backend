-- Resolve Failed Migration
-- This migration marks the failed migration '20251117192727_add_atomic_swap_models' as rolled back
-- so that subsequent migrations can proceed normally with 'npx prisma migrate deploy'

-- Update the failed migration to mark it as rolled back
UPDATE "_prisma_migrations"
SET 
    finished_at = NULL,
    rolled_back_at = NOW(),
    logs = COALESCE(logs, '') || E'\nRolled back automatically by migration 20251117235900_resolve_failed_migration'
WHERE 
    migration_name = '20251117192727_add_atomic_swap_models'
    AND finished_at IS NULL
    AND rolled_back_at IS NULL;

