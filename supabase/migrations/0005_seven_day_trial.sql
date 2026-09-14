-- Self-serve signup is back (alongside the admin-invite path from
-- 0004) — a business can start a free trial immediately without waiting
-- on an admin, then the admin flips plan/subscription_status to
-- 'pro'/'active' from /admin once payment is received. 7 days (not the
-- original 14) matches the shorter trial window that pairs with manual
-- admin upgrade.
alter table organizations
  alter column trial_ends_at set default (now() + interval '7 days');
