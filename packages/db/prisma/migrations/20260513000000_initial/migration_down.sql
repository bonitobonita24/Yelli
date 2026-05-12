-- =============================================================
-- Yelli — Initial migration — DOWN
--
-- Emergency rollback only. Drops all tables, indexes, FKs, and
-- enums created by migration.sql in reverse-dependency order.
-- Prisma does NOT run this automatically — apply manually via
-- `psql $DATABASE_URL -f migration_down.sql` after backing up
-- the database. ALL DATA IN THESE TABLES WILL BE LOST.
-- =============================================================

-- Drop child tables first (in reverse FK dependency order)
DROP TABLE IF EXISTS "whiteboard_snapshots" CASCADE;
DROP TABLE IF EXISTS "shared_files" CASCADE;
DROP TABLE IF EXISTS "recordings" CASCADE;
DROP TABLE IF EXISTS "chat_messages" CASCADE;
DROP TABLE IF EXISTS "call_logs" CASCADE;
DROP TABLE IF EXISTS "participants" CASCADE;
DROP TABLE IF EXISTS "meetings" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "platform_settings" CASCADE;
DROP TABLE IF EXISTS "invoices" CASCADE;
DROP TABLE IF EXISTS "subscriptions" CASCADE;
DROP TABLE IF EXISTS "departments" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "organizations" CASCADE;

-- Drop enums
DROP TYPE IF EXISTS "recording_status";
DROP TYPE IF EXISTS "storage_type";
DROP TYPE IF EXISTS "message_type";
DROP TYPE IF EXISTS "call_status";
DROP TYPE IF EXISTS "call_type";
DROP TYPE IF EXISTS "participant_role";
DROP TYPE IF EXISTS "meeting_status";
DROP TYPE IF EXISTS "invoice_status";
DROP TYPE IF EXISTS "user_status";
DROP TYPE IF EXISTS "user_role";
DROP TYPE IF EXISTS "subscription_status";
DROP TYPE IF EXISTS "plan_tier";
