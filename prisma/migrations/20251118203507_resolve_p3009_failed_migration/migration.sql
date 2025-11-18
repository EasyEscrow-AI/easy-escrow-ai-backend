-- Resolve P3009 Error: Delete Failed Migration Record
-- This migration deletes the failed migration record from _prisma_migrations table
-- Run this ONCE to clear the P3009 error, then the main migration can run

-- Delete the failed migration record
DELETE FROM "_prisma_migrations" 
WHERE migration_name = '20251117234309_fix_atomic_swap_schema'
AND finished_at IS NULL;

-- Log the resolution
DO $$
BEGIN
  RAISE NOTICE 'Deleted failed migration record: 20251117234309_fix_atomic_swap_schema';
  RAISE NOTICE 'Next deploy will re-run the fixed migration successfully';
END $$;

