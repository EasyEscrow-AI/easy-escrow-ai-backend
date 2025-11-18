-- Resolve P3009 Error: Delete ALL Failed Migration Records
-- This migration deletes any failed migration records from _prisma_migrations table
-- Run this ONCE to clear the P3009 error, then the main migration can run

-- Delete ALL failed atomic swap migration records (handles both old and new migration names)
DELETE FROM "_prisma_migrations" 
WHERE migration_name IN (
  '20251117192727_add_atomic_swap_models',
  '20251117234309_fix_atomic_swap_schema'
)
AND finished_at IS NULL;

-- Log the resolution
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % failed migration record(s) for atomic swap migrations', deleted_count;
  RAISE NOTICE 'Next deploy will run the fixed migration successfully';
END $$;

