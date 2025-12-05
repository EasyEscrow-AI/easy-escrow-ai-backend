-- =====================================================================
-- PRODUCTION DATABASE TRUNCATION SCRIPT (NO CONFIRMATION)
-- =====================================================================
-- 
-- PURPOSE: Clear all data from production database (automated version)
-- WHEN: Run BEFORE deploying atomic swap system to production
-- WARNING: This script runs WITHOUT confirmation prompts
--
-- USAGE:
--   psql $DATABASE_ADMIN_URL -f scripts/truncate-production-database-no-confirm.sql
--
-- =====================================================================

\echo 'Connected to database:'
SELECT current_database();

\echo ''
\echo '📊 Counting records before truncation...'

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

-- Begin transaction
BEGIN;

\echo ''
\echo '🗑️  Truncating tables...'

-- Truncate all tables
TRUNCATE TABLE zero_fee_swap_logs CASCADE;
TRUNCATE TABLE swap_transactions CASCADE;
TRUNCATE TABLE swap_offers CASCADE;
TRUNCATE TABLE webhooks CASCADE;
TRUNCATE TABLE transaction_logs CASCADE;
TRUNCATE TABLE receipts CASCADE;
TRUNCATE TABLE settlements CASCADE;
TRUNCATE TABLE deposits CASCADE;
TRUNCATE TABLE agreements CASCADE;
TRUNCATE TABLE idempotency_keys CASCADE;
TRUNCATE TABLE nonce_pool CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE authorized_apps CASCADE;

\echo ''
\echo '📊 Verifying truncation...'

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

-- Commit
COMMIT;

\echo ''
\echo '✅ Database truncation complete!'

