-- Run this in the Supabase SQL Editor.
-- It updates the DashboardAccount role constraint to use Staff instead of stuff.

alter table public."DashboardAccount"
  drop constraint if exists "DashboardAccount_role_check";

update public."DashboardAccount"
set role = 'Staff'
where role = 'stuff';

alter table public."DashboardAccount"
  add constraint "DashboardAccount_role_check"
  check (role in ('admin', 'Staff', 'viewer'));

