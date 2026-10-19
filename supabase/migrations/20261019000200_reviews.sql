-- ==========================================================================
-- Customer reviews: submitted on the website (via the submit-review Edge
-- Function), approved by the owner in the admin area, then shown publicly.
-- The public only ever sees approved reviews and never the reviewer's email.
-- ==========================================================================

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  email text not null default '' check (char_length(email) <= 200),
  vehicle text not null default '' check (char_length(vehicle) <= 60),
  area text not null default '' check (char_length(area) <= 60),
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 10 and 1500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
create index reviews_status_created_idx on public.reviews (status, created_at desc);

create policy "admins read reviews" on public.reviews
  for select to authenticated using (public.is_admin());
create policy "admins update reviews" on public.reviews
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete reviews" on public.reviews
  for delete to authenticated using (public.is_admin());

-- Public read path: approved reviews only, without email addresses.
create or replace function public.get_approved_reviews(max_rows integer default 30)
returns table (name text, vehicle text, area text, rating smallint, comment text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.name, r.vehicle, r.area, r.rating, r.comment, r.created_at
  from public.reviews r
  where r.status = 'approved'
  order by r.created_at desc
  limit least(greatest(max_rows, 1), 100);
$$;
revoke all on function public.get_approved_reviews(integer) from public;
grant execute on function public.get_approved_reviews(integer) to anon, authenticated;
