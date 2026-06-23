-- ───────────────────────────────────────────────────────────────────────────
-- VANBA Job Hunter AI — Supabase PostgreSQL Migration
-- ───────────────────────────────────────────────────────────────────────────
-- How to use:
--   1. Create a new Supabase project at https://supabase.com
--   2. In your Supabase dashboard, go to SQL Editor → New Query
--   3. Paste ALL contents of this file and click RUN
--   4. Run `npx prisma db push` from the backend folder to sync Prisma client
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. EXTENSIONS ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 2. ENUM TYPES ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE PlanType AS ENUM ('WEEKLY','MONTHLY','TWO_MONTH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE SubStatus AS ENUM ('ACTIVE','EXPIRED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE PaymentStatus AS ENUM ('PENDING','COMPLETED','FAILED','REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. APP USERS (links to Supabase auth.users) ───────────────────────────
CREATE TABLE IF NOT EXISTS "app_users" (
  "id"        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "email"     TEXT NOT NULL UNIQUE,
  "fullName"  TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "app_users_email_idx" ON "app_users"("email");

-- ── 4. USER PROFILES (resume data) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_profiles" (
  "id"             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"         UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "fullName"       TEXT NOT NULL,
  "phone"          TEXT,
  "skills"         TEXT   NOT NULL,   -- JSON stringified array
  "experience"     TEXT   NOT NULL,   -- JSON stringified array
  "education"      TEXT   NOT NULL,   -- JSON stringified array
  "rawResumeText"  TEXT   NOT NULL,
  "resumePath"     TEXT   NOT NULL,
  "targetTitles"   TEXT   NOT NULL,   -- JSON stringified array
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "user_profiles_userId_idx" ON "user_profiles"("userId");

-- ── 5. JOBS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "jobs" (
  "id"           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"       UUID REFERENCES "app_users"("id") ON DELETE SET NULL,
  "title"        TEXT   NOT NULL,
  "company"      TEXT   NOT NULL,
  "isMnc"        BOOLEAN NOT NULL DEFAULT FALSE,
  "location"     TEXT   NOT NULL,
  "isRemote"     BOOLEAN NOT NULL DEFAULT TRUE,
  "platform"     TEXT   NOT NULL,
  "url"          TEXT   NOT NULL UNIQUE,
  "description"  TEXT   NOT NULL,
  "salary"       TEXT,
  "postedDate"   TEXT,
  "matchScore"   INT    NOT NULL,
  "matchReason"  TEXT,
  "status"       TEXT   NOT NULL DEFAULT 'SCRAPED',
  "appliedAt"    TIMESTAMPTZ,
  "logs"         TEXT,                            -- JSON stringified array
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "jobs_userId_idx"    ON "jobs"("userId");
CREATE INDEX IF NOT EXISTS "jobs_status_idx"    ON "jobs"("status");
CREATE INDEX IF NOT EXISTS "jobs_matchScore_idx" ON "jobs"("matchScore");

-- ── 6. SUBSCRIPTIONS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"         UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "planType"       "PlanType" NOT NULL,
  "status"         "SubStatus" NOT NULL DEFAULT 'ACTIVE',
  "jobsVisible"    INT NOT NULL,
  "jobsCount"      INT NOT NULL DEFAULT 0,
  "cycleStart"     TIMESTAMPTZ NOT NULL,
  "cycleEnd"       TIMESTAMPTZ NOT NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "subscriptions_userId_idx" ON "subscriptions"("userId");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");

-- ── 7. PAYMENTS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payments" (
  "id"                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"            UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "subscriptionId"    UUID REFERENCES "subscriptions"("id"),
  "amount"            DOUBLE PRECISION NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'INR',
  "planType"          "PlanType" NOT NULL,
  "razorpayOrderId"   TEXT UNIQUE,
  "razorpayPaymentId" TEXT UNIQUE,
  "status"            "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt"            TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "payments_userId_idx" ON "payments"("userId");

-- ── 8. AGENT SETTINGS (per-user) ─────────────────────────────────────────────
DROP TABLE IF EXISTS "agent_settings";   -- drops old global version
CREATE TABLE IF NOT EXISTS "agent_settings" (
  "id"                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"            UUID NOT NULL UNIQUE REFERENCES "app_users"("id") ON DELETE CASCADE,
  "isActive"          BOOLEAN NOT NULL DEFAULT FALSE,
  "dailyLimit"        INT    NOT NULL DEFAULT 10,
  "remoteOnly"        BOOLEAN NOT NULL DEFAULT TRUE,
  "autoApplyThreshold" INT   NOT NULL DEFAULT 75,
  "proxyUrl"          TEXT,
  "cookiesJson"       TEXT,
  "openrouterApiKey"  TEXT,
  "openrouterModels"  TEXT,   -- JSON array of model IDs
  "_rotationIdx"      INT    DEFAULT 0,
  "ceoDirective"      TEXT,
  "targetField"       TEXT,
  "experienceLevel"   TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "agent_settings_userId_idx" ON "agent_settings"("userId");

-- ── 9. SYSTEM LOGS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "system_logs" (
  "id"        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "level"     TEXT NOT NULL,           -- INFO, WARNING, ERROR, SUCCESS
  "message"   TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "system_logs_timestamp_idx" ON "system_logs"("timestamp");

-- ── 10. MNC_LOOKUPS (reference table) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mnc_lookups" (
  "id"    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name"  TEXT NOT NULL UNIQUE
);
INSERT INTO "mnc_lookups" ("name")
  SELECT DISTINCT UNNEST(ARRAY[
    'Google','Microsoft','Amazon','Meta','Apple','Netflix',
    'TCS','Tata Consultancy Services','Infosys','Wipro','Accenture',
    'Cognizant','IBM','Capgemini','Deloitte','EY','Ernst & Young',
    'PwC','KPMG','HP','Dell','Oracle','SAP','Cisco','Salesforce',
    'Intel','Nvidia','AMD','Adobe','Uber','Tesla','Siemens','Samsung',
    'Sony','HCL','Tech Mahindra','L&T','LTI','Qualcomm','Broadcom',
    'VMware','GitLab','Snowflake','Palantir','MongoDB','Atlassian',
    'ServiceNow','Workday','Box','Slack','Zoom','Datadog','Splunk',
    'Fortinet','Palo Alto Networks','BlackRock','JP Morgan',
    'Goldman Sachs','Morgan Stanley','Bank of America'
  ]) AS name
ON CONFLICT ("name") DO NOTHING;
