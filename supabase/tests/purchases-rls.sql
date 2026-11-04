-- Prueba real, sin correos ni contraseñas. Todos los datos ficticios se revierten.
begin;
do $$
declare
  a uuid; b uuid; ba uuid; bb uuid; ia uuid; ib uuid; bad uuid; result jsonb;
  payload jsonb; rejected boolean; before_count bigint;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id<>a order by created_at limit 1;
  if a is null or b is null then raise exception 'Se requieren dos usuarios existentes para esta prueba.'; end if;
  insert into public.businesses(user_id,business_name) values(a,'QA FICTICIO A') returning id into ba;
  insert into public.businesses(user_id,business_name) values(b,'QA FICTICIO B') returning id into bb;
  insert into public.invoices(user_id,business_id,ocr_status,ocr_draft) values(a,ba,'review','{"test":true}') returning id into ia;
  insert into public.invoices(user_id,business_id,ocr_status,ocr_draft) values(b,bb,'review','{"test":true}') returning id into ib;
  insert into public.invoices(user_id,business_id,ocr_status,ocr_draft) values(a,ba,'review','{"test":true}') returning id into bad;
  payload:=jsonb_build_object('supplier_name','QA PROVEEDOR FICTICIO','supplier_ruc','','invoice_number','QA-0001',
    'issue_date',current_date::text,'currency','PEN','total_amount',23.60,'tax_amount',3.60,'discount_amount',0,
    'items',jsonb_build_array(jsonb_build_object('description','QA ACEITE 1 L','quantity',2,'unit','un','unit_price',10,'subtotal',20)));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.invoices where id=ib)<>0 then raise exception 'RLS permitió leer una factura ajena.'; end if;
  rejected:=false;
  begin perform public.confirm_invoice_data(ib,payload); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Se confirmó una factura ajena.'; end if;
  rejected:=false;
  begin insert into public.products(user_id,business_id,name) values(a,bb,'QA RELACIÓN AJENA');
    exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'RLS permitió enlazar un negocio ajeno.'; end if;
  rejected:=false;
  begin perform 1 from public.integration_credentials limit 1; exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'El cliente puede consultar la bóveda.'; end if;
  rejected:=false;
  begin perform public.begin_invoice_ocr(ia,a); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'El cliente pudo reservar intentos del servidor.'; end if;
  result:=public.confirm_invoice_data(ia,payload);
  if result->>'success'<>'true' then raise exception 'Falló la confirmación propia.'; end if;
  if (select count(*) from public.invoice_items where invoice_id=ia)<>1
    or (select count(*) from public.price_history where invoice_id=ia)<>1
    or (select unit_price from public.price_history where invoice_id=ia)<>11.8
    then raise exception 'Productos o coste final incoherentes.'; end if;
  result:=public.confirm_invoice_data(ia,payload);
  if result->>'already_confirmed'<>'true' or (select count(*) from public.price_history where invoice_id=ia)<>1
    then raise exception 'La confirmación no es idempotente.'; end if;
  select count(*) into before_count from public.suppliers where business_id=ba;
  rejected:=false;
  begin perform public.confirm_invoice_data(bad,payload || '{"total_amount":500,"supplier_name":"QA NO DEBE GUARDARSE"}');
    exception when raise_exception then rejected:=true; end;
  if not rejected or (select count(*) from public.invoice_items where invoice_id=bad)<>0
    or (select count(*) from public.suppliers where business_id=ba)<>before_count
    then raise exception 'El rechazo dejó datos parciales.'; end if;
  rejected:=false;
  begin perform public.confirm_invoice_data(bad,payload); exception when raise_exception then rejected:=true; end;
  if not rejected or (select count(*) from public.invoice_items where invoice_id=bad)<>0
    then raise exception 'Se aceptó un número de comprobante duplicado.'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.invoices where id=ia)<>0 or (select count(*) from public.price_history where invoice_id=ia)<>0
    then raise exception 'El segundo usuario puede consultar la compra ajena.'; end if;
  execute 'reset role';
end $$;
rollback;
select 'PASS: aislamiento entre dos usuarios, bóveda, relaciones, confirmación, costes, duplicados y reversión de errores' as verification;
