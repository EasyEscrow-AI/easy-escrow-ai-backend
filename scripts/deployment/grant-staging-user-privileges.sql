-- ============================================================================
-- Grant Migration Privileges to staging_user
-- ============================================================================
-- 
-- This script grants necessary privileges to staging_user to run Prisma
-- migrations on the DigitalOcean managed PostgreSQL database.
--
-- Prerequisites:
--   - Connect as 'doadmin' user (DigitalOcean's admin user)
--   - Target database: easyescrow_staging
--
-- Usage:
--   psql "postgresql://doadmin:PASSWORD@HOST:25060/easyescrow_staging?sslmode=require" -f grant-staging-user-privileges.sql
--
-- Or via DigitalOcean Console:
--   1. Go to DigitalOcean Database Console
--   2. Click "Console" button (auto-connects as doadmin)
--   3. Copy and paste the SQL below
-- ============================================================================

-- Display current user (should be doadmin)
SELECT current_user, current_database();

-- ============================================================================
-- 1. GRANT CONNECT PRIVILEGES
-- ============================================================================
GRANT CONNECT ON DATABASE easyescrow_staging TO staging_user;

-- ============================================================================
-- 2. GRANT SCHEMA USAGE
-- ============================================================================
GRANT USAGE ON SCHEMA public TO staging_user;

-- ============================================================================
-- 3. GRANT ALL PRIVILEGES ON EXISTING TABLES
-- ============================================================================
-- This allows staging_user to ALTER, SELECT, INSERT, UPDATE, DELETE on all tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;

-- ============================================================================
-- 4. GRANT ALL PRIVILEGES ON EXISTING SEQUENCES
-- ============================================================================
-- Needed for auto-increment columns and serial types
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;

-- ============================================================================
-- 5. GRANT ALL PRIVILEGES ON EXISTING FUNCTIONS
-- ============================================================================
-- Needed if migrations involve custom functions or triggers
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO staging_user;

-- ============================================================================
-- 6. GRANT DEFAULT PRIVILEGES FOR FUTURE OBJECTS
-- ============================================================================
-- Ensures staging_user automatically gets privileges on new objects created by doadmin
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL PRIVILEGES ON TABLES TO staging_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL PRIVILEGES ON SEQUENCES TO staging_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL PRIVILEGES ON FUNCTIONS TO staging_user;

-- ============================================================================
-- 7. GRANT CREATE PRIVILEGES ON SCHEMA
-- ============================================================================
-- Allows staging_user to create new tables, indexes, etc.
GRANT CREATE ON SCHEMA public TO staging_user;

-- ============================================================================
-- 8. UPGRADE USER WITH CREATEDB CAPABILITY (OPTIONAL BUT RECOMMENDED)
-- ============================================================================
-- This allows staging_user to create databases and roles
-- Middle ground between limited grants and full SUPERUSER
ALTER USER staging_user WITH CREATEDB CREATEROLE;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Check privileges on key tables
SELECT 
    schemaname,
    tablename,
    tableowner,
    hasindexes,
    hastriggers
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check user attributes
SELECT 
    usename,
    usesuper,
    usecreatedb,
    usecreaterole
FROM pg_user 
WHERE usename = 'staging_user';

-- Check table privileges for staging_user
SELECT 
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'staging_user'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
\echo '✅ Privileges granted successfully to staging_user!'
\echo '✅ staging_user can now run Prisma migrations'
\echo ''
\echo 'Next steps:'
\echo '  1. Exit the database console'
\echo '  2. Run: npx prisma migrate deploy'
\echo ''

