-- ============================================================================
-- EasyEscrow Staging Database Setup Script
-- ============================================================================
-- This script creates the isolated staging database infrastructure
-- within the DigitalOcean Managed PostgreSQL cluster.
--
-- Prerequisites:
--   - Connected to PostgreSQL cluster as admin user (doadmin)
--   - Replace PASSWORD placeholders with secure passwords
--
-- Usage:
--   psql "postgresql://doadmin:PASSWORD@host:25060/defaultdb?sslmode=require" -f setup-staging-database.sql
-- ============================================================================

-- Step 1: Create Staging Database
-- ============================================================================
\echo '📦 Creating staging database...'

-- Drop existing database if it exists (CAUTION: This will delete all data)
-- Uncomment the next line only if you want to recreate from scratch
-- DROP DATABASE IF EXISTS easyescrow_staging;

CREATE DATABASE easyescrow_staging
  WITH 
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.UTF-8'
  LC_CTYPE = 'en_US.UTF-8'
  TEMPLATE = template0;

\echo '✅ Staging database created'

-- Step 2: Create Staging User
-- ============================================================================
\echo '👤 Creating staging user...'

-- Drop existing user if it exists (CAUTION: This will remove all permissions)
-- Uncomment the next line only if you want to recreate from scratch
-- DROP USER IF EXISTS staging_user;

-- Replace 'YOUR_SECURE_PASSWORD_HERE' with a strong, randomly generated password
-- Recommended: Use a password manager to generate a 32+ character password
-- IMPORTANT: If your password contains single quotes ('), escape them by doubling ('')
-- Example: If password is "P@ss'word", use 'P@ss''word' in the query below
CREATE USER staging_user WITH PASSWORD 'YOUR_SECURE_PASSWORD_HERE';

\echo '✅ Staging user created'

-- Step 3: Grant Database Connection Privileges
-- ============================================================================
\echo '🔐 Granting connection privileges...'

GRANT CONNECT ON DATABASE easyescrow_staging TO staging_user;

\echo '✅ Connection privileges granted'

-- Step 4: Connect to Staging Database
-- ============================================================================
\echo '🔄 Connecting to staging database...'
\c easyescrow_staging

-- Step 5: Grant Schema Privileges
-- ============================================================================
\echo '📋 Granting schema privileges...'

-- Grant usage and create privileges on public schema
GRANT USAGE ON SCHEMA public TO staging_user;
GRANT CREATE ON SCHEMA public TO staging_user;

\echo '✅ Schema privileges granted'

-- Step 6: Grant Table Privileges
-- ============================================================================
\echo '📊 Granting table privileges...'

-- Grant all privileges on existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO staging_user;

\echo '✅ Table privileges granted'

-- Step 7: Set Default Privileges for Future Objects
-- ============================================================================
\echo '🔮 Setting default privileges for future objects...'

-- Ensure staging_user gets privileges on all future tables, sequences, and functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO staging_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO staging_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON FUNCTIONS TO staging_user;

\echo '✅ Default privileges configured'

-- Step 8: Verify Setup
-- ============================================================================
\echo ''
\echo '🔍 Verifying setup...'
\echo ''

-- List databases
\echo 'Databases:'
\l easyescrow_staging

-- List users
\echo ''
\echo 'Users:'
\du staging_user

-- List privileges
\echo ''
\echo 'Schema privileges:'
SELECT 
  nspname AS schema_name,
  pg_catalog.pg_get_userbyid(nspowner) AS owner,
  array_to_string(nspacl, E'\n') AS privileges
FROM pg_catalog.pg_namespace
WHERE nspname = 'public';

\echo ''
\echo '✅ Setup verification complete'

-- Step 9: Next Steps
-- ============================================================================
\echo ''
\echo '============================================================================'
\echo '✅ STAGING DATABASE SETUP COMPLETE'
\echo '============================================================================'
\echo ''
\echo 'Next steps:'
\echo '  1. Save the staging_user password securely'
\echo '  2. Update your .env.staging file with the connection string'
\echo '  3. Add DATABASE_URL to DigitalOcean App Platform secrets'
\echo '  4. Run Prisma migrations: npx prisma migrate deploy'
\echo '  5. Seed staging data: npm run seed:staging'
\echo ''
\echo 'Connection strings:'
\echo '  Direct:  postgresql://staging_user:PASSWORD@HOST:25060/easyescrow_staging?sslmode=require'
\echo '  Pooled:  postgresql://staging_user:PASSWORD@POOLER_HOST:25061/easyescrow_staging?sslmode=require'
\echo ''
\echo 'Security reminders:'
\echo '  ❌ Do NOT commit passwords to Git'
\echo '  ✅ Store passwords in DigitalOcean Secrets (encrypted)'
\echo '  ✅ Use strong, randomly generated passwords (32+ chars)'
\echo '  ✅ Always use sslmode=require for staging/production'
\echo ''
\echo '============================================================================'

-- ============================================================================
-- Optional: Grant Read-Only Access to Analytics User (if needed)
-- ============================================================================

-- Uncomment if you need a read-only analytics user
/*
\echo 'Creating read-only analytics user...'

CREATE USER analytics_user WITH PASSWORD 'ANALYTICS_PASSWORD_HERE';
GRANT CONNECT ON DATABASE easyescrow_staging TO analytics_user;

\c easyescrow_staging

GRANT USAGE ON SCHEMA public TO analytics_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO analytics_user;

\echo '✅ Analytics user created with read-only access'
*/

-- ============================================================================
-- Optional: Create Additional Schemas (if needed)
-- ============================================================================

-- Uncomment if you need separate schemas for different purposes
/*
\echo 'Creating additional schemas...'

CREATE SCHEMA IF NOT EXISTS staging;
GRANT USAGE ON SCHEMA staging TO staging_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA staging TO staging_user;

\echo '✅ Additional schemas created'
*/

