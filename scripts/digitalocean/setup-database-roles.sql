-- ============================================
-- DigitalOcean PostgreSQL Setup Script
-- Creates logical databases and user roles
-- ============================================

-- Connect as doadmin user to defaultdb first:
-- psql "postgresql://doadmin:PASSWORD@HOST:25432/defaultdb?sslmode=require"

-- ============================================
-- Step 1: Create Logical Databases
-- ============================================

CREATE DATABASE easyescrow_prod;
CREATE DATABASE easyescrow_stage;
CREATE DATABASE easyescrow_dev;

-- ============================================
-- Step 2: Create User Roles
-- ============================================

-- PRODUCTION ROLES
-- Replace SECURE_PASSWORD with actual secure passwords
CREATE USER app_user_prod WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD_1';
CREATE USER migrate_user_prod WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD_2';

-- STAGING ROLES
CREATE USER app_user_stage WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD_3';
CREATE USER migrate_user_stage WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD_4';

-- DEVELOPMENT ROLES
CREATE USER app_user_dev WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD_5';
CREATE USER migrate_user_dev WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD_6';

-- ============================================
-- Step 3: Grant Database Connection Permissions
-- ============================================

-- Production
GRANT CONNECT ON DATABASE easyescrow_prod TO app_user_prod;
GRANT CONNECT ON DATABASE easyescrow_prod TO migrate_user_prod;

-- Staging
GRANT CONNECT ON DATABASE easyescrow_stage TO app_user_stage;
GRANT CONNECT ON DATABASE easyescrow_stage TO migrate_user_stage;

-- Development
GRANT CONNECT ON DATABASE easyescrow_dev TO app_user_dev;
GRANT CONNECT ON DATABASE easyescrow_dev TO migrate_user_dev;

-- ============================================
-- Step 4: Configure Production Database Permissions
-- ============================================

-- Connect to production database
\c easyescrow_prod

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO app_user_prod;
GRANT USAGE ON SCHEMA public TO migrate_user_prod;

-- App User Permissions (DML only: SELECT, INSERT, UPDATE, DELETE)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user_prod;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user_prod;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user_prod;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user_prod;

-- Migration User Permissions (DDL: CREATE, ALTER, DROP)
GRANT CREATE ON SCHEMA public TO migrate_user_prod;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO migrate_user_prod;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO migrate_user_prod;

-- Set default privileges for migration user
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO migrate_user_prod;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO migrate_user_prod;

-- ============================================
-- Step 5: Configure Staging Database Permissions
-- ============================================

\c easyescrow_stage

GRANT USAGE ON SCHEMA public TO app_user_stage;
GRANT USAGE ON SCHEMA public TO migrate_user_stage;

-- App user permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user_stage;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user_stage;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user_stage;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user_stage;

-- Migration user permissions
GRANT CREATE ON SCHEMA public TO migrate_user_stage;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO migrate_user_stage;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO migrate_user_stage;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO migrate_user_stage;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO migrate_user_stage;

-- ============================================
-- Step 6: Configure Development Database Permissions
-- ============================================

\c easyescrow_dev

GRANT USAGE ON SCHEMA public TO app_user_dev;
GRANT USAGE ON SCHEMA public TO migrate_user_dev;

-- App user permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user_dev;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user_dev;

-- Migration user permissions
GRANT CREATE ON SCHEMA public TO migrate_user_dev;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO migrate_user_dev;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO migrate_user_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO migrate_user_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO migrate_user_dev;

-- ============================================
-- Step 7: Verify Permissions
-- ============================================

-- Connect back to defaultdb
\c defaultdb

-- Check created databases
SELECT datname FROM pg_database WHERE datname LIKE 'easyescrow%';

-- Check created users
SELECT usename FROM pg_user WHERE usename LIKE '%_user_%';

-- ============================================
-- Step 8: Test Permissions (Optional)
-- ============================================

-- To test, connect as app_user_prod and try:
-- \c easyescrow_prod app_user_prod
-- SELECT 1; -- Should work
-- CREATE TABLE test (id INT); -- Should fail (no DDL permission)

-- Then connect as migrate_user_prod and try:
-- \c easyescrow_prod migrate_user_prod
-- CREATE TABLE test (id INT); -- Should work
-- SELECT * FROM test; -- Should work
-- DROP TABLE test; -- Should work

-- ============================================
-- Notes
-- ============================================

-- Password Security:
-- 1. Generate secure passwords: 
--    openssl rand -base64 32
-- 2. Store in password manager
-- 3. Rotate quarterly
-- 4. Never commit passwords to git

-- Connection Strings for App Platform:
-- Production (app):
--   postgresql://app_user_prod:PASSWORD@HOST:25060/easyescrow_prod?sslmode=require
--
-- Production (migrations):
--   postgresql://migrate_user_prod:PASSWORD@HOST:25060/easyescrow_prod?sslmode=require
--
-- Staging (app):
--   postgresql://app_user_stage:PASSWORD@HOST:25060/easyescrow_stage?sslmode=require
--
-- Development (app):
--   postgresql://app_user_dev:PASSWORD@HOST:25060/easyescrow_dev?sslmode=require

