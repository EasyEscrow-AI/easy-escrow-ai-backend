-- Resolve Failed Migration via SQL
-- This migration marks the failed migration '20251117192727_add_atomic_swap_models' as rolled back
-- Allows 'npx prisma migrate deploy' to work without configuration changes

-- Update the failed migration to mark it as rolled back
UPDATE "_prisma_migrations"
SET 
    finished_at = NULL,
    rolled_back_at = NOW(),
    logs = COALESCE(logs, '') || E'\nRolled back automatically by migration 20251117234300_resolve_failed_migration'
WHERE 
    migration_name = '20251117192727_add_atomic_swap_models'
    AND finished_at IS NULL
    AND rolled_back_at IS NULL;

