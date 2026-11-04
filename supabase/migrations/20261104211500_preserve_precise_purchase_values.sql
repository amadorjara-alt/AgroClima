-- Mantener los decimales del valor unitario SUNAT y de cantidades fraccionarias.
-- Solo se amplía la precisión; no cambian valores, permisos, RLS ni estados.
set local lock_timeout = '3s';
set local statement_timeout = '30s';
alter table public.invoice_items
  alter column unit_price type numeric(20,10),
  alter column quantity type numeric(18,6);
alter table public.price_history
  alter column unit_price type numeric(24,4);
