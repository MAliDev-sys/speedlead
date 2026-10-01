-- Shortened from 7 days to 1: a prospect gets a single day to see the
-- product work, then hits /suspended?reason=trial_expired (see
-- requireCurrentOrg() in lib/org.ts) and has to contact the owner to be
-- manually upgraded from /admin. Pairs with isOrgLocked() in lib/org.ts,
-- which now also blocks the actual lead-response pipeline (not just the
-- dashboard) once the trial runs out, so an expired trial org can no
-- longer get free AI replies/Slack alerts/follow-ups by just leaving its
-- lead sources receiving traffic.
alter table organizations
  alter column trial_ends_at set default (now() + interval '1 day');
