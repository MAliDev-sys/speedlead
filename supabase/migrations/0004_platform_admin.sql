-- Platform administration: this app is no longer self-serve signup.
-- Only a platform admin (you) can create client workspaces and invite
-- their users — see app/admin/*. A brand-new table rather than a role
-- column on profiles because this is a platform-wide privilege,
-- completely separate from organization_members.role (which is scoped
-- to one tenant).
create table platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS enabled with NO policies at all: this makes the table unreadable/
-- unwritable by anon and authenticated roles entirely (RLS default-denies
-- when no policy grants access), while the service-role admin client
-- (which every admin/* server action uses) bypasses RLS as usual. There
-- is deliberately no way to self-grant platform-admin from the browser.
alter table platform_admins enable row level security;

-- Bootstrap the first admin (yourself) manually after this migration:
--   1. Supabase dashboard -> Authentication -> Users -> find your account -> copy its UID
--   2. insert into platform_admins (user_id) values ('<your-uid>');
-- See docs/SETUP.md.
