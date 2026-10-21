-- Job value per lead (Lead page → Actions → "Job value"), so Reports can
-- show revenue won. Optional: only filled in when the owner knows it,
-- typically once a lead is marked won. Existing RLS on leads ("members can
-- modify org leads") already covers editing it.
alter table leads
  add column if not exists deal_value numeric(12, 2) check (deal_value >= 0);
