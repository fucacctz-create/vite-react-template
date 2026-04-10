create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null unique,
  city text,
  moving_date text,
  household_size text,
  budget numeric,
  bedrooms text,
  bathrooms text,
  property_type text
);

create index if not exists waitlist_email_idx on public.waitlist (email);
create index if not exists waitlist_city_idx on public.waitlist (city);
create index if not exists waitlist_created_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;

drop policy if exists "Allow insert from service" on public.waitlist;
create policy "Allow insert from service" on public.waitlist
  for insert
  with check (true);

drop policy if exists "No public reads" on public.waitlist;
create policy "No public reads" on public.waitlist
  for select
  using (false);
