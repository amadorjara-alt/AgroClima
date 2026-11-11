alter table public.farms
  add column if not exists elevation_m numeric(8,2) check (elevation_m between -500 and 9000);
