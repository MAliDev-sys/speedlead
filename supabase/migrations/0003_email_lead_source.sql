-- Adds 'email' as a lead source type so a customer emailing the business
-- directly (not just forms/webhooks/missed-calls) becomes a lead too.
-- Each org gets exactly one, auto-provisioned at signup (see
-- app/actions/orgs.ts) reusing its existing public_token as the local
-- part of a dedicated inbound address — see
-- src/app/api/webhooks/resend/route.ts and docs/SETUP.md for the Resend
-- inbound-receiving setup this depends on.
alter type lead_source_type add value if not exists 'email';
