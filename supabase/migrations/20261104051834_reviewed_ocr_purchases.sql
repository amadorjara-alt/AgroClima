-- Cambios compatibles con los documentos y credenciales existentes.
alter table public.integration_credentials drop constraint integration_credentials_provider_check;
alter table public.integration_credentials add constraint integration_credentials_provider_check
  check (provider in ('gemini','openai','serpapi','firecrawl','ocrspace'));

alter table public.invoices
  add column ocr_draft jsonb,
  add column ocr_error text,
  add column ocr_provider text,
  add column ocr_request_id uuid,
  add column ocr_started_at timestamptz,
  add column processed_at timestamptz,
  add column confirmed_at timestamptz,
  add column subtotal_amount numeric,
  add column tax_amount numeric,
  add column discount_amount numeric;
alter table public.invoice_items add column purchase_unit text;
alter table public.price_history add column price_basis text;

create table public.ocr_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  created_at timestamptz not null default now(),
  outcome text not null default 'processing' check (outcome in ('processing','review','failed'))
);
alter table public.ocr_requests enable row level security;
revoke all on public.ocr_requests from anon, authenticated;
grant select on public.ocr_requests to authenticated;
grant all on public.ocr_requests to service_role;
create policy ocr_requests_owner on public.ocr_requests for select to authenticated
  using ((select auth.uid())=user_id);
create index ocr_requests_created_idx on public.ocr_requests(created_at);
create index ocr_requests_user_created_idx on public.ocr_requests(user_id,created_at);
create index ocr_requests_invoice_idx on public.ocr_requests(invoice_id);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index invoice_items_product_idx on public.invoice_items(product_id);
create index price_history_invoice_idx on public.price_history(invoice_id);
create index price_history_supplier_idx on public.price_history(supplier_id);
create index price_history_user_idx on public.price_history(user_id);
create index products_business_idx on public.products(business_id);

-- No se eliminan las políticas existentes. Las restrictivas impiden enlazar
-- referencias ajenas aunque otra política permisiva compruebe solo user_id.
create policy suppliers_owner_relations on public.suppliers as restrictive for all to authenticated
  using (user_id=(select auth.uid()) and (business_id is null or exists
    (select 1 from public.businesses b where b.id=business_id and b.user_id=(select auth.uid()))))
  with check (user_id=(select auth.uid()) and (business_id is null or exists
    (select 1 from public.businesses b where b.id=business_id and b.user_id=(select auth.uid()))));
create policy products_owner_relations on public.products as restrictive for all to authenticated
  using (user_id=(select auth.uid()) and (business_id is null or exists
    (select 1 from public.businesses b where b.id=business_id and b.user_id=(select auth.uid()))))
  with check (user_id=(select auth.uid()) and (business_id is null or exists
    (select 1 from public.businesses b where b.id=business_id and b.user_id=(select auth.uid()))));
create policy invoices_owner_relations on public.invoices as restrictive for all to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()) and (business_id is null or exists
    (select 1 from public.businesses b where b.id=invoices.business_id and b.user_id=(select auth.uid())))
    and (supplier_id is null or exists (select 1 from public.suppliers s where s.id=invoices.supplier_id
      and s.user_id=(select auth.uid()) and s.business_id is not distinct from invoices.business_id)));
create policy items_owner_relations on public.invoice_items as restrictive for all to authenticated
  using (user_id=(select auth.uid()) and exists (select 1 from public.invoices i
    where i.id=invoice_items.invoice_id and i.user_id=(select auth.uid())))
  with check (user_id=(select auth.uid()) and exists (select 1 from public.invoices i
    where i.id=invoice_items.invoice_id and i.user_id=(select auth.uid())
      and (invoice_items.product_id is null or exists (select 1 from public.products p
        where p.id=invoice_items.product_id and p.user_id=(select auth.uid())
          and p.business_id is not distinct from i.business_id))));
create policy prices_owner_relations on public.price_history as restrictive for all to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()) and exists (select 1 from public.products p
    where p.id=price_history.product_id and p.user_id=(select auth.uid())
      and (price_history.invoice_id is null or exists (select 1 from public.invoices i
        where i.id=price_history.invoice_id and i.user_id=(select auth.uid()) and i.business_id is not distinct from p.business_id))
      and (price_history.supplier_id is null or exists (select 1 from public.suppliers s
        where s.id=price_history.supplier_id and s.user_id=(select auth.uid()) and s.business_id is not distinct from p.business_id))));

-- Solo el servidor puede reservar un intento; la identidad ya fue verificada
-- con Auth. El bloqueo global mantiene coherentes los límites concurrentes.
create function public.begin_invoice_ocr(p_invoice_id uuid,p_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v public.invoices; r uuid;
begin
  select * into v from public.invoices where id=p_invoice_id and user_id=p_user_id for update;
  if not found or not exists (select 1 from public.businesses where id=v.business_id and user_id=p_user_id)
    then raise exception 'OCR_NOT_FOUND'; end if;
  if v.confirmed_at is not null then return jsonb_build_object('confirmed',true); end if;
  if v.ocr_status='review' and v.ocr_draft is not null then
    return jsonb_build_object('cached',true,'draft',v.ocr_draft); end if;
  if v.ocr_status='processing' and v.ocr_started_at>now()-interval '5 minutes'
    then raise exception 'OCR_BUSY'; end if;
  perform pg_catalog.pg_advisory_xact_lock(7654872302::bigint);
  if (select count(*) from public.ocr_requests where user_id=p_user_id and created_at>now()-interval '24 hours')>=20
    or (select count(*) from public.ocr_requests where created_at>now()-interval '24 hours')>=200
    then raise exception 'OCR_QUOTA'; end if;
  insert into public.ocr_requests(user_id,invoice_id) values(p_user_id,p_invoice_id) returning id into r;
  update public.invoices set ocr_status='processing',ocr_error=null,ocr_started_at=now(),ocr_request_id=r where id=p_invoice_id;
  return jsonb_build_object('cached',false,'request_id',r);
end $$;
revoke all on function public.begin_invoice_ocr(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_invoice_ocr(uuid,uuid) to service_role;

-- La confirmación completa se ejecuta en una transacción, con los permisos
-- del usuario. Un segundo clic devuelve el mismo resultado sin duplicar filas.
create function public.confirm_invoice_data(p_invoice_id uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  u uuid:=auth.uid(); v public.invoices; s uuid; p uuid; item jsonb;
  supplier_name text; supplier_ruc text; doc text; curr text; issued date;
  descr text; unit_name text; brand_name text; category_name text;
  qty numeric; unit_price numeric; line_total numeric;
  total numeric; tax numeric; discount numeric; lines_total numeric:=0; item_count integer;
begin
  if u is null then raise exception 'Inicia sesión para confirmar.'; end if;
  select * into v from public.invoices where id=p_invoice_id and user_id=u for update;
  if not found then raise exception 'Factura no encontrada.'; end if;
  if v.confirmed_at is not null then return jsonb_build_object('success',true,'invoice_id',v.id,'already_confirmed',true); end if;
  if v.ocr_status<>'review' or v.ocr_draft is null then raise exception 'Primero procesa el comprobante con OCR.'; end if;
  perform 1 from public.businesses where id=v.business_id and user_id=u for update;
  if not found then raise exception 'Negocio no válido.'; end if;
  if jsonb_typeof(p_data)<>'object' or jsonb_typeof(p_data->'items')<>'array'
    then raise exception 'Revisa los datos y los productos.'; end if;
  item_count:=jsonb_array_length(p_data->'items');
  if item_count<1 or item_count>200 then raise exception 'Confirma entre 1 y 200 productos.'; end if;
  supplier_name:=trim(p_data->>'supplier_name'); supplier_ruc:=trim(coalesce(p_data->>'supplier_ruc',''));
  doc:=trim(coalesce(p_data->>'invoice_number','')); curr:=upper(trim(p_data->>'currency'));
  if coalesce(length(supplier_name),0) not between 1 and 200 or length(doc)>100
    or (supplier_ruc<>'' and supplier_ruc!~'^[0-9]{11}$') or coalesce(curr,'')!~'^[A-Z]{3}$'
    then raise exception 'Revisa proveedor, RUC, número y moneda.'; end if;
  if coalesce(p_data->>'issue_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then raise exception 'Confirma la fecha del comprobante.'; end if;
  issued:=(p_data->>'issue_date')::date;
  if issued>current_date then raise exception 'La fecha no puede estar en el futuro.'; end if;
  if jsonb_typeof(p_data->'total_amount') is distinct from 'number'
    or jsonb_typeof(p_data->'tax_amount') is distinct from 'number'
    or jsonb_typeof(p_data->'discount_amount') is distinct from 'number'
    then raise exception 'Confirma total, impuestos adicionales y descuento; usa 0 si no corresponde.'; end if;
  total:=(p_data->>'total_amount')::numeric; tax:=(p_data->>'tax_amount')::numeric;
  discount:=(p_data->>'discount_amount')::numeric;
  if total<=0 or total>1000000000 or tax<0 or tax>1000000000 or discount<0 or discount>1000000000
    or total<>round(total,2) or tax<>round(tax,2) or discount<>round(discount,2)
    then raise exception 'Los importes deben ser válidos y tener hasta dos decimales.'; end if;
  for item in select value from jsonb_array_elements(p_data->'items') loop
    if jsonb_typeof(item->'quantity') is distinct from 'number' or jsonb_typeof(item->'unit_price') is distinct from 'number'
      or jsonb_typeof(item->'subtotal') is distinct from 'number' then raise exception 'Revisa los importes de cada producto.'; end if;
    descr:=trim(item->>'description'); unit_name:=trim(item->>'unit');
    qty:=(item->>'quantity')::numeric; unit_price:=(item->>'unit_price')::numeric; line_total:=(item->>'subtotal')::numeric;
    if coalesce(length(descr),0) not between 1 and 300 or coalesce(length(unit_name),0) not between 1 and 50
      or length(coalesce(item->>'brand',''))>100 or length(coalesce(item->>'category',''))>100
      or qty<=0 or qty>1000000 or unit_price<0 or unit_price>1000000000 or line_total<0 or line_total>1000000000
      or abs(round(qty*unit_price,2)-line_total)>0.02 or line_total<>round(line_total,2)
      then raise exception 'Cantidad por precio debe coincidir con el importe de cada línea; revisa también su unidad.'; end if;
    lines_total:=lines_total+line_total;
  end loop;
  if lines_total<=0 or abs(lines_total+tax-discount-total)>0.02
    then raise exception 'La suma de productos más impuestos adicionales menos descuentos debe coincidir con el total.'; end if;
  select id into s from public.suppliers where user_id=u and business_id=v.business_id
    and ((supplier_ruc<>'' and ruc=supplier_ruc) or (supplier_ruc='' and lower(name)=lower(supplier_name))) order by created_at limit 1;
  if s is null then insert into public.suppliers(user_id,business_id,name,ruc)
    values(u,v.business_id,supplier_name,nullif(supplier_ruc,'')) returning id into s; end if;
  if doc<>'' and exists (select 1 from public.invoices where user_id=u and business_id=v.business_id
    and supplier_id=s and lower(invoice_number)=lower(doc) and confirmed_at is not null and id<>v.id)
    then raise exception 'Ya existe una compra confirmada con ese proveedor y número.'; end if;
  for item in select value from jsonb_array_elements(p_data->'items') loop
    descr:=regexp_replace(trim(item->>'description'),'\s+',' ','g');
    unit_name:=lower(trim(item->>'unit')); brand_name:=trim(coalesce(item->>'brand',''));
    category_name:=coalesce(nullif(trim(item->>'category'),''),'Otros');
    qty:=(item->>'quantity')::numeric; unit_price:=(item->>'unit_price')::numeric; line_total:=(item->>'subtotal')::numeric;
    p:=null;
    select id into p from public.products where user_id=u and business_id=v.business_id
      and lower(regexp_replace(trim(name),'\s+',' ','g'))=lower(descr)
      and lower(coalesce(brand,''))=lower(brand_name) and lower(coalesce(unit,''))=unit_name order by created_at limit 1;
    if p is null then insert into public.products(user_id,business_id,name,unit,brand,category)
      values(u,v.business_id,descr,unit_name,nullif(brand_name,''),category_name) returning id into p; end if;
    insert into public.invoice_items(user_id,invoice_id,product_id,description,quantity,unit_price,subtotal,purchase_unit)
      values(u,v.id,p,descr,qty,unit_price,line_total,unit_name);
    -- Coste final por unidad: impuestos y descuentos generales prorrateados.
    insert into public.price_history(user_id,product_id,supplier_id,invoice_id,unit_price,price_basis)
      values(u,p,s,v.id,round(line_total/qty*total/lines_total,4),'final_allocated');
  end loop;
  update public.invoices set supplier_id=s,invoice_number=nullif(doc,''),issue_date=issued,currency=curr,
    total_amount=total,subtotal_amount=lines_total,tax_amount=tax,discount_amount=discount,
    ocr_status='completed',confirmed_at=now(),ocr_error=null where id=v.id and user_id=u;
  return jsonb_build_object('success',true,'invoice_id',v.id,'item_count',item_count);
end $$;
revoke all on function public.confirm_invoice_data(uuid,jsonb) from public,anon;
grant execute on function public.confirm_invoice_data(uuid,jsonb) to authenticated;

comment on column public.price_history.price_basis is 'final_allocated: coste final por unidad con impuestos y descuentos generales prorrateados; referencia histórica, sin garantía de stock o precio actual.';
