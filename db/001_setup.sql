-- SafeSwap Growth OS — one-time setup
-- Run once in the Supabase SQL Editor of the main SafeSwap project.
--
-- What this does:
--   1. Creates a separate `growth` schema for the machine's own data.
--   2. Creates read-only VIEWS over SafeSwap data, exposing only safe columns
--      (no emails, IPs, devices, bank details, balances, phone numbers).
--   3. Creates a `growth_bot` login that can ONLY read those views and
--      read/write the growth tables. It has no access to the public schema.
--
-- Before running: replace CHANGE_ME_STRONG_PASSWORD below.

create schema if not exists growth;

-------------------------------------------------------------------------------
-- 1. The machine's own tables
-------------------------------------------------------------------------------

create table if not exists growth.runs (
  id bigserial primary key,
  job text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb,
  error text
);

create table if not exists growth.events (
  id bigserial primary key,
  agent text not null,
  kind text not null,
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on growth.events (created_at desc);

create table if not exists growth.daily_stats (
  day date not null,
  metric text not null,
  source text not null default '',
  value numeric not null,
  primary key (day, metric, source)
);

create table if not exists growth.leads (
  id bigserial primary key,
  platform text not null,
  handle text not null,
  url text,
  name text,
  game text,
  followers integer,
  avg_views integer,
  contact text,
  fit_score integer,
  status text not null default 'new',
  draft_subject text,
  draft_body text,
  notes text,
  found_at timestamptz not null default now(),
  contacted_at timestamptz,
  replied_at timestamptz,
  unique (platform, handle)
);

create table if not exists growth.videos (
  id bigserial primary key,
  series text not null,
  title text not null,
  account text,
  script jsonb,
  video_url text,
  thumb_url text,
  status text not null default 'review',
  predicted_reach integer,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  posted_at timestamptz
);

create table if not exists growth.posts (
  id bigserial primary key,
  video_id bigint references growth.videos (id) on delete set null,
  platform text not null,
  account text not null,
  external_id text,
  url text,
  posted_at timestamptz,
  views integer, likes integer, comments integer, shares integer,
  follows integer, link_clicks integer,
  updated_at timestamptz
);

create table if not exists growth.accounts (
  handle text primary key,
  platform text not null,
  niche text,
  status text not null default 'warming',
  warmup_started date,
  followers integer,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists growth.briefings (
  day date primary key,
  text text not null,
  audio_url text,
  created_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- 2. Read-only views over SafeSwap (safe columns only)
-------------------------------------------------------------------------------

-- New sign-ups: no usernames, emails, IPs or devices.
create or replace view growth.v_signups as
select p.created_at,
       p.country,
       (p.referred_by is not null) as was_referred,
       cs.content_code as creator_code,
       cs.creator_id
from public.profiles p
left join public.creator_signups cs on cs.username = p.username;

-- Link clicks with UTM tags (no session ids).
create or replace view growth.v_link_clicks as
select created_at, slug, content_code, utm_source, utm_medium, utm_campaign
from public.link_clicks;

-- Site visits (no usernames).
create or replace view growth.v_site_visits as
select created_at, path, country, referrer
from public.site_visits;

-- Public listings (what anyone can already see on the site).
create or replace view growth.v_listings as
select id, created_at, name, game, game_key, price, rarity, image_url,
       seller, sold, sold_at, stock, views, favourites_count, market,
       delivery_methods
from public.listings
where coalesce(hidden, false) = false
  and coalesce(pending_review, false) = false;

-- Daily business pulse: counts and totals only.
create or replace view growth.v_daily_core as
with d as (
  select generate_series(current_date - 89, current_date, interval '1 day')::date as day
)
select d.day,
  (select count(*) from public.profiles p where p.created_at::date = d.day) as signups,
  (select count(*) from public.trades t
     where t.completed_at::date = d.day and t.refunded_at is null) as orders,
  (select coalesce(sum(t.price), 0) from public.trades t
     where t.completed_at::date = d.day and t.refunded_at is null) as gmv,
  (select count(*) from public.listings l where l.created_at::date = d.day) as new_listings,
  (select count(*) from public.listings l where coalesce(l.sold, false) = false
     and coalesce(l.hidden, false) = false) as live_listings_now
from d;

-- Weekly leaderboards. Respects profiles.leaderboard_hidden.
create or replace view growth.v_top_sellers_week as
select t.seller as username,
       count(*) as sales,
       coalesce(sum(t.seller_earnings), 0) as earned
from public.trades t
left join public.profiles p on p.username = t.seller
where t.completed_at >= date_trunc('week', now())
  and t.refunded_at is null
  and coalesce(p.leaderboard_hidden, false) = false
group by t.seller
order by sales desc
limit 20;

create or replace view growth.v_top_buyers_week as
select t.buyer as username,
       count(*) as orders,
       coalesce(sum(coalesce(t.buyer_paid, t.price)), 0) as spent
from public.trades t
left join public.profiles p on p.username = t.buyer
where t.completed_at >= date_trunc('week', now())
  and t.refunded_at is null
  and coalesce(p.leaderboard_hidden, false) = false
group by t.buyer
order by orders desc
limit 20;

-- Seller trust summary (public review data).
create or replace view growth.v_seller_reviews as
select seller, count(*) as reviews, round(avg(rating)::numeric, 2) as avg_rating
from public.reviews
where coalesce(hidden, false) = false
group by seller;

-- What people search for (demand signals). No usernames.
create or replace view growth.v_search_events as
select created_at, term, term_key, game, result_count
from public.search_events;

-- Creators you already know about, so the Scout never double-contacts.
-- No contact details, pins, tokens or balances.
create or replace view growth.v_known_creators as
select 'creators' as src, platform, handle, profile_url, outreach_status as status, created_at
from public.creators
union all
select 'creator_leads', 'tiktok', tiktok_username, null, status, created_at
from public.creator_leads
union all
select 'content_creators', 'tiktok', tiktok_username, null, status, created_at
from public.content_creators where tiktok_username is not null
union all
select 'content_creators', 'youtube', youtube_username, null, status, created_at
from public.content_creators where youtube_username is not null;

-- How creator content is performing.
create or replace view growth.v_creator_videos as
select id, creator_id, platform, url, title, status, views, likes,
       submitted_at, views_24h, views_7d
from public.creator_videos;

-------------------------------------------------------------------------------
-- 3. The machine's login: growth only, nothing else
-------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'growth_bot') then
    create role growth_bot with login password 'CHANGE_ME_STRONG_PASSWORD';
  end if;
end $$;

alter role growth_bot set search_path = growth;
alter role growth_bot set statement_timeout = '60s';

grant usage on schema growth to growth_bot;
grant select on all tables in schema growth to growth_bot;  -- includes the views
grant insert, update, delete on
  growth.runs, growth.events, growth.daily_stats, growth.leads,
  growth.videos, growth.posts, growth.accounts, growth.briefings
  to growth_bot;
grant usage, select on all sequences in schema growth to growth_bot;

-- Explicitly no access to the app's own schema.
revoke all on schema public from growth_bot;

-- Quick check (should return numbers, not an error):
-- select * from growth.v_daily_core order by day desc limit 7;
