-- Lets a signed-in org member insert into `messages` directly (previously
-- only the service-role webhook/notify pipeline could — see the "members
-- can view org messages" select-only policy in 0001_init.sql). Needed for
-- the manual reply box on the lead detail page: a human typing a reply
-- from the dashboard logs it the same way an automated send does.
create policy "members can insert org messages" on messages
  for insert with check (is_org_member(org_id));
