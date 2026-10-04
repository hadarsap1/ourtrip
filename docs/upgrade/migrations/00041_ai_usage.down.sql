-- Rollback for 00041. Drops the usage counters (counts only, nothing else lost).
drop table if exists public.ai_usage;
