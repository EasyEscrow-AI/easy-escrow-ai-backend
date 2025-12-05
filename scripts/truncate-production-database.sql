-- =====================================================================
-- PRODUCTION DATABASE TRUNCATION SCRIPT
-- =====================================================================
-- 
-- PURPOSE: Clear all data from production database before deployment
-- WHEN: Run BEFORE deploying atomic swap system to production
-- WHY: Ensures clean slate with no test data or residual records
--
-- SAFETY: This is a ZERO-USER deployment - no production data exists
-- 
-- USAGE:
--   psql $DATABASE_ADMIN_URL -f scripts/truncate-production-database.sql
--
-- OR with explicit connection:
--   psql -h <host> -p <port> -U <user> -d <database> -f scripts/truncate-production-database.sql
--
-- =====================================================================

\echo ''
\echo '╔════════════════════════════════════════════════════════════════╗'
\echo '║     PRODUCTION DATABASE TRUNCATION - CONFIRMATION REQUIRED     ║'
\echo '╚════════════════════════════════════════════════════════════════╝'
\echo ''

-- Show current database
\echo 'Connected to database:'
SELECT current_database();

\echo ''
\echo '⚠️  WARNING: This will DELETE ALL DATA from the following tables:'
\echo ''
\echo '   - agreements (old escrow system)'
\echo '   - deposits'
\echo '   - idempotency_keys'
\echo '   - settlements'
\echo '   - receipts'
\echo '   - transaction_logs'
\echo '   - webhooks'
\echo '   - users'
\echo '   - nonce_pool'
\echo '   - swap_offers (atomic swap system)'
\echo '   - swap_transactions (atomic swap system)'
\echo '   - authorized_apps (API key management)'
\echo '   - zero_fee_swap_logs (audit logs)'
\echo ''
\echo '⚠️  This action CANNOT be undone!'
\echo ''
\echo 'Press Ctrl+C to cancel, or press Enter to continue...'
\prompt 'Type YES to confirm truncation: ' confirm_truncate

-- Only proceed if user types YES
\if :{?confirm_truncate}
    \if :confirm_truncate = 'YES'
        \echo ''
        \echo '✅ Confirmation received. Proceeding with truncation...'
        \echo ''
    \else
        \echo ''
        \echo '❌ Truncation cancelled. You must type YES (all caps) to confirm.'
        \echo ''
        \q
    \endif
\else
    \echo ''
    \echo '❌ Truncation cancelled. No confirmation received.'
    \echo ''
    \q
\endif

-- Begin transaction for safety
BEGIN;

\echo '📊 Counting records before truncation...'
\echo ''

-- Show record counts
SELECT 'agreements' AS table_name, COUNT(*) AS record_count FROM agreements
UNION ALL
SELECT 'deposits', COUNT(*) FROM deposits
UNION ALL
SELECT 'idempotency_keys', COUNT(*) FROM idempotency_keys
UNION ALL
SELECT 'settlements', COUNT(*) FROM settlements
UNION ALL
SELECT 'receipts', COUNT(*) FROM receipts
UNION ALL
SELECT 'transaction_logs', COUNT(*) FROM transaction_logs
UNION ALL
SELECT 'webhooks', COUNT(*) FROM webhooks
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'nonce_pool', COUNT(*) FROM nonce_pool
UNION ALL
SELECT 'swap_offers', COUNT(*) FROM swap_offers
UNION ALL
SELECT 'swap_transactions', COUNT(*) FROM swap_transactions
UNION ALL
SELECT 'authorized_apps', COUNT(*) FROM authorized_apps
UNION ALL
SELECT 'zero_fee_swap_logs', COUNT(*) FROM zero_fee_swap_logs;

\echo ''
\echo '🗑️  Truncating tables...'
\echo ''

-- Truncate all tables in correct order (respecting foreign keys)
-- CASCADE will handle foreign key constraints automatically

-- Atomic swap system tables
TRUNCATE TABLE zero_fee_swap_logs CASCADE;
TRUNCATE TABLE swap_transactions CASCADE;
TRUNCATE TABLE swap_offers CASCADE;

-- Old escrow system tables
TRUNCATE TABLE webhooks CASCADE;
TRUNCATE TABLE transaction_logs CASCADE;
TRUNCATE TABLE receipts CASCADE;
TRUNCATE TABLE settlements CASCADE;
TRUNCATE TABLE deposits CASCADE;
TRUNCATE TABLE agreements CASCADE;

-- Supporting tables
TRUNCATE TABLE idempotency_keys CASCADE;
TRUNCATE TABLE nonce_pool CASCADE;
TRUNCATE TABLE users CASCADE;

-- API key management (CAREFUL: This removes authorized apps)
-- Comment out if you want to preserve API keys
TRUNCATE TABLE authorized_apps CASCADE;

\echo ''
\echo '📊 Verifying truncation (all counts should be 0)...'
\echo ''

-- Show record counts after truncation
SELECT 'agreements' AS table_name, COUNT(*) AS record_count FROM agreements
UNION ALL
SELECT 'deposits', COUNT(*) FROM deposits
UNION ALL
SELECT 'idempotency_keys', COUNT(*) FROM idempotency_keys
UNION ALL
SELECT 'settlements', COUNT(*) FROM settlements
UNION ALL
SELECT 'receipts', COUNT(*) FROM receipts
UNION ALL
SELECT 'transaction_logs', COUNT(*) FROM transaction_logs
UNION ALL
SELECT 'webhooks', COUNT(*) FROM webhooks
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'nonce_pool', COUNT(*) FROM nonce_pool
UNION ALL
SELECT 'swap_offers', COUNT(*) FROM swap_offers
UNION ALL
SELECT 'swap_transactions', COUNT(*) FROM swap_transactions
UNION ALL
SELECT 'authorized_apps', COUNT(*) FROM authorized_apps
UNION ALL
SELECT 'zero_fee_swap_logs', COUNT(*) FROM zero_fee_swap_logs;

\echo ''
\echo '✅ All tables truncated successfully!'
\echo ''
\echo '📝 Next steps:'
\echo '   1. Re-seed authorized_apps if needed (see temp/seed-staging.sql)'
\echo '   2. Verify nonce pool is empty and ready for fresh nonces'
\echo '   3. Deploy application to production'
\echo '   4. Run smoke tests to verify clean deployment'
\echo ''

-- Commit the transaction
COMMIT;

\echo '✅ Transaction committed. Database is now clean and ready for deployment!'
\echo ''

