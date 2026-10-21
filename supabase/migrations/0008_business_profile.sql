-- Editable business profile (Settings → Business profile): a logo plus
-- the customer-facing contact details a business owner expects to be
-- able to change after signup. Name/business_type/timezone/alert_* already
-- exist on organizations (0001_init.sql) and just weren't editable yet.
alter table organizations
  add column if not exists logo_url text,
  add column if not exists website text,
  add column if not exists business_phone text,
  add column if not exists business_address text;

-- Public-read bucket for org logos. Uploads only ever go through the
-- server action in app/actions/business-profile.ts using the service-role
-- client (after checking the caller is an owner/admin of that org), so no
-- storage.objects insert/update policies are granted to browser sessions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
