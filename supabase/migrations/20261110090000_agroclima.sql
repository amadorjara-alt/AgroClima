-- Tablas nuevas para AgroClima. Las tablas previas de CompraSmart se conservan.
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  crop text not null check (char_length(trim(crop)) between 2 and 80),
  area_hectares numeric(12,2) not null check (area_hectares > 0 and area_hectares <= 1000000),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  locality text not null default '',
  precipitation_threshold_mm numeric(7,2) not null default 20 check (precipitation_threshold_mm between 0 and 1000),
  wind_threshold_kmh numeric(7,2) not null default 50 check (wind_threshold_kmh between 0 and 500),
  min_temperature_c numeric(5,2) not null default 5 check (min_temperature_c between -100 and 80),
  max_temperature_c numeric(5,2) not null default 35 check (max_temperature_c between -100 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farms_temperature_range check (min_temperature_c < max_temperature_c)
);

create table if not exists public.weather_history (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  forecast_date date not null,
  fetched_at timestamptz not null default now(),
  temperature_max_c numeric(6,2),
  temperature_min_c numeric(6,2),
  precipitation_mm numeric(8,2) not null default 0 check (precipitation_mm >= 0),
  humidity_mean_pct numeric(5,2) check (humidity_mean_pct between 0 and 100),
  wind_max_kmh numeric(7,2) not null default 0 check (wind_max_kmh >= 0),
  weather_code integer,
  source text not null default 'Open-Meteo' check (source = 'Open-Meteo'),
  unique (farm_id, forecast_date, fetched_at)
);

create index if not exists farms_user_created_idx on public.farms(user_id, created_at desc);
create index if not exists weather_farm_date_idx on public.weather_history(farm_id, forecast_date desc, fetched_at desc);
create index if not exists weather_user_fetched_idx on public.weather_history(user_id, fetched_at desc);

alter table public.farms enable row level security;
alter table public.weather_history enable row level security;

revoke all on public.farms, public.weather_history from anon, public;
grant select, insert, update, delete on public.farms to authenticated;
grant select, insert on public.weather_history to authenticated;

drop policy if exists farms_owner_all on public.farms;
create policy farms_owner_all on public.farms for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists weather_owner_read on public.weather_history;
create policy weather_owner_read on public.weather_history for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())
  ));

drop policy if exists weather_owner_insert on public.weather_history;
create policy weather_owner_insert on public.weather_history for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())
  ));

create or replace function public.set_farms_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists farms_updated_at on public.farms;
create trigger farms_updated_at before update on public.farms
  for each row execute function public.set_farms_updated_at();
