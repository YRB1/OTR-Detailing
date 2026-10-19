-- ==========================================================================
-- OTR Detailing — booking backend schema
-- Bookings, enquiries, services/prices and business settings.
-- Customers never read or write these tables directly: public writes go
-- through Edge Functions (service role); the owner manages everything from
-- the admin area as an authenticated user listed in public.admins.
-- ==========================================================================

-- ---------- admins ----------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create policy "admins can see admin list" on public.admins
  for select to authenticated using (public.is_admin());

-- ---------- services (prices are read server-side at checkout) ----------
create table public.services (
  id text primary key,
  name text not null,
  price_pence integer not null check (price_pence between 0 and 100000),
  active boolean not null default true,
  sort integer not null default 0
);
alter table public.services enable row level security;

insert into public.services (id, name, price_pence, sort) values
  ('exterior', 'Exterior Clean', 2000, 1),
  ('interior', 'Interior Clean', 3000, 2),
  ('full', 'Full Interior & Exterior', 4000, 3);

create policy "anyone can read services" on public.services
  for select to anon, authenticated using (true);
create policy "admins can update services" on public.services
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- business settings (single row) ----------
create table public.business_settings (
  id boolean primary key default true check (id),
  business_name text not null default 'OTR Detailing',
  email text not null default 'otr.detailinguk@gmail.com',
  phone text not null default '',
  area text not null default 'Coventry & surrounding areas',
  hours text not null default 'Mon – Sat, 8am – 6pm',
  cancellation_fee_pence integer not null default 1500 check (cancellation_fee_pence >= 0),
  slot_times text[] not null default array['09:00','10:30','12:00','13:30','15:00','16:30'],
  closed_weekdays smallint[] not null default array[0]::smallint[], -- 0 = Sunday
  booking_window_days smallint not null default 21 check (booking_window_days between 1 and 120),
  min_notice_hours smallint not null default 12 check (min_notice_hours between 0 and 168),
  updated_at timestamptz not null default now()
);
alter table public.business_settings enable row level security;
insert into public.business_settings default values;

create policy "anyone can read settings" on public.business_settings
  for select to anon, authenticated using (true);
create policy "admins can update settings" on public.business_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- bookings ----------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('OTR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  service_id text not null references public.services (id),
  service_name text not null,
  price_pence integer not null check (price_pence >= 0),
  vehicle_make text not null check (char_length(vehicle_make) between 1 and 60),
  vehicle_model text not null check (char_length(vehicle_model) between 1 and 60),
  vehicle_colour text not null check (char_length(vehicle_colour) between 1 and 40),
  vehicle_size text not null default '' check (char_length(vehicle_size) <= 60),
  slot_date date not null,
  slot_time text not null check (slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  customer_name text not null check (char_length(customer_name) between 1 and 100),
  customer_phone text not null check (char_length(customer_phone) between 6 and 30),
  customer_email text not null check (char_length(customer_email) between 3 and 200),
  customer_address text not null check (char_length(customer_address) between 3 and 300),
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'confirmed', 'completed', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'refunded', 'pay_on_day')),
  source text not null default 'online' check (source in ('online', 'manual')),
  hold_expires_at timestamptz,
  hold_token text,
  stripe_session_id text unique,
  stripe_payment_intent text,
  paid_at timestamptz,
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bookings enable row level security;

-- One live booking per slot. Expired payment holds are cancelled before a
-- new hold is placed (see create-checkout), so they never block a slot.
create unique index bookings_one_per_slot
  on public.bookings (slot_date, slot_time)
  where status <> 'cancelled';
create index bookings_slot_date_idx on public.bookings (slot_date);
create index bookings_created_at_idx on public.bookings (created_at desc);

create policy "admins read bookings" on public.bookings
  for select to authenticated using (public.is_admin());
create policy "admins add bookings" on public.bookings
  for insert to authenticated with check (public.is_admin());
create policy "admins update bookings" on public.bookings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete bookings" on public.bookings
  for delete to authenticated using (public.is_admin());

-- ---------- enquiries (contact form) ----------
create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 200),
  message text not null check (char_length(message) between 1 and 3000),
  status text not null default 'new' check (status in ('new', 'replied', 'archived')),
  created_at timestamptz not null default now()
);
alter table public.enquiries enable row level security;
create index enquiries_created_at_idx on public.enquiries (created_at desc);

create policy "admins read enquiries" on public.enquiries
  for select to authenticated using (public.is_admin());
create policy "admins update enquiries" on public.enquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete enquiries" on public.enquiries
  for delete to authenticated using (public.is_admin());

-- ---------- updated_at ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.business_settings
  for each row execute function public.touch_updated_at();

-- ---------- public availability (no personal data) ----------
create or replace function public.get_booked_slots(from_date date, to_date date)
returns table (slot_date date, slot_time text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.slot_date, b.slot_time
  from public.bookings b
  where b.slot_date between from_date and least(to_date, from_date + 120)
    and b.status <> 'cancelled'
    and not (b.status = 'awaiting_payment' and b.hold_expires_at < now());
$$;
revoke all on function public.get_booked_slots(date, date) from public;
grant execute on function public.get_booked_slots(date, date) to anon, authenticated;
