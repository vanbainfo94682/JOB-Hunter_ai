-- Backend Supabase Schema Updates for Job Types and Pricing Quotas

-- 1. Add 'workType' column to the jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "workType" TEXT DEFAULT 'REMOTE';

-- 2. Update subscriptions table to support distinct job quotas
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "jobs_remote_count" INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "jobs_hybrid_count" INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "jobs_onsite_count" INTEGER DEFAULT 0;

-- 3. You can drop 'jobsCount' and 'jobsVisible' if you want, but for backward compatibility, 
-- we will just ignore them in the new code and use the specific counts.


-- 4. Update plan_metadata table with new prices and quotas
UPDATE public.plan_metadata SET price_inr = 99, jobs_visible = 30, features = ARRAY['30 jobs total', '10 Remote, 10 Hybrid, 10 On-Site', 'Basic matching'] WHERE id = 'WEEKLY';
UPDATE public.plan_metadata SET price_inr = 199, jobs_visible = 45, features = ARRAY['45 jobs total', '15 Remote, 15 Hybrid, 15 On-Site', 'Advanced matching'] WHERE id = 'MONTHLY';
UPDATE public.plan_metadata SET price_inr = 349, jobs_visible = 75, features = ARRAY['75 jobs total', '25 Remote, 25 Hybrid, 25 On-Site', 'AI cover letters'] WHERE id = 'TWO_MONTH';
UPDATE public.plan_metadata SET price_inr = 499, jobs_visible = 105, features = ARRAY['105 jobs total', '35 Remote, 35 Hybrid, 35 On-Site', '24/7 Autopilot'] WHERE id = 'THREE_MONTH';

