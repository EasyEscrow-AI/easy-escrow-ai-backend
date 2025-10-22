-- Fix Database Permissions for Staging
-- Run this SQL script on your staging PostgreSQL database

-- Connect to the staging database first:
-- \c easyescrow_staging

-- Grant all permissions on all tables to the staging user
-- Replace 'staging_user' with your actual database username from DATABASE_URL

-- Grant permissions on all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;

-- Grant permissions on all sequences (for auto-increment IDs)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;

-- Grant permissions on the schema itself
GRANT ALL PRIVILEGES ON SCHEMA public TO staging_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO staging_user;

-- Specific table grants (if the above doesn't work)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE agreements TO staging_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE transactions TO staging_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deposits TO staging_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE webhooks TO staging_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO staging_user;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO staging_user;

-- Verify permissions
\dp agreements
\dp transactions
\dp deposits

