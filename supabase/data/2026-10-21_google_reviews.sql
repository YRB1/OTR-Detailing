-- Google reviews copied onto the website (from OTR Detailing's Google Business
-- profile, 21 Oct 2026). Inserted as already approved so they show straight
-- away; Gideon can hide or delete any of them from the admin area.
-- Safe to re-run: each review is only inserted if it isn't already there.
--
-- Run with: npx supabase@2.121.0 db query --project-ref banccxqxuidvyczkhopj -f supabase/data/2026-10-21_google_reviews.sql

insert into public.reviews (name, area, rating, comment, status, created_at)
select v.name, 'Google review', 5, v.comment, 'approved', v.created_at::timestamptz
from (values
  ('Ehemachovaar O.',
   $$Great service, spotless results and really good attention to detail, would highly recommend :)$$,
   '2026-10-20 18:00:00+01'),
  ('Megan D.',
   $$Amazing service from OTR Detailing! My car looks spotless, and the attention to detail was brilliant. Professional, friendly and great value. Highly recommend to anyone looking to get their car looking brand new!$$,
   '2026-10-20 03:00:00+01'),
  ('Augustine M.',
   $$Had my car cleaned by mr OTR. Honestly, it looked like it had just came out the showroom. He paid great attention to detail and made sure every inch of my car was spick and span. Will deffo be booking him more regularly in the future 👍🏾$$,
   '2026-10-20 02:00:00+01'),
  ('Rkay',
   $$Amazing service. He’s done an amazing job with my car and has got my car looking brand new. You can tell he takes real pride in his work. Definitely recommend him to anyone looking for a proper detail. Will 100% be using him again$$,
   '2026-10-20 01:00:00+01')
) as v(name, comment, created_at)
where not exists (
  select 1 from public.reviews r where r.name = v.name and r.comment = v.comment
);

select name, rating, status, area, created_at from public.reviews order by created_at desc;
