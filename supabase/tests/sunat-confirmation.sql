-- Solo datos ficticios nuevos. La transacción se revierte por completo.
begin;
do $$
declare
  u uuid; b uuid; a uuid; c uuid; d uuid; bad uuid; result jsonb; payload jsonb; rejected boolean;
begin
  select id into u from auth.users order by created_at limit 1;
  if u is null then raise exception 'Se requiere un usuario existente para la prueba aislada.'; end if;
  insert into public.businesses(user_id,business_name) values(u,'QA SUNAT FICTICIO - ROLLBACK') returning id into b;
  insert into public.invoices(user_id,business_id,ocr_status,ocr_draft) values(u,b,'review','{"test":true}') returning id into a;
  insert into public.invoices(user_id,business_id,ocr_status,ocr_draft) values(u,b,'review','{"test":true}') returning id into c;
  insert into public.invoices(user_id,business_id,ocr_status,ocr_draft) values(u,b,'review','{"test":true}') returning id into d;
  insert into public.invoices(user_id,business_id,ocr_status,ocr_draft) values(u,b,'review','{"test":true}') returning id into bad;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  payload:=jsonb_build_object('supplier_name','QA PROVEEDOR FICTICIO','supplier_ruc','','invoice_number','E001-QA-1',
    'issue_date',current_date::text,'currency','PEN','total_amount',145.68,'tax_amount',22.22,'discount_amount',0,
    'items',jsonb_build_array(jsonb_build_object('description','QA BATERIA DEMO','quantity',1,'unit','un','unit_price',123.4567,'subtotal',123.46)));
  result:=public.confirm_invoice_data(a,payload);
  if result->>'success'<>'true' or (select unit_price from public.invoice_items where invoice_id=a)<>123.4567
    or (select subtotal from public.invoice_items where invoice_id=a)<>123.46
    or (select total_amount from public.invoices where id=a)<>145.68
    or (select ocr_status from public.invoices where id=a)<>'completed'
    then raise exception 'No se conservó el precio SUNAT o no se confirmó la compra ficticia.'; end if;
  result:=public.confirm_invoice_data(a,payload);
  if result->>'already_confirmed'<>'true' or (select count(*) from public.invoice_items where invoice_id=a)<>1
    then raise exception 'La confirmación duplicó el producto.'; end if;
  payload:=jsonb_build_object('supplier_name','QA PROVEEDOR FICTICIO','supplier_ruc','','invoice_number','E001-QA-2',
    'issue_date',current_date::text,'currency','PEN','total_amount',3.70,'tax_amount',0,'discount_amount',0,
    'items',jsonb_build_array(jsonb_build_object('description','QA DECIMALES','quantity',3,'unit','un','unit_price',1.2345,'subtotal',3.70)));
  perform public.confirm_invoice_data(c,payload);
  if (select unit_price from public.price_history where invoice_id=c)<>1.2333
    then raise exception 'Se redondeó la referencia histórica a dos decimales.'; end if;
  payload:=jsonb_build_object('supplier_name','QA PROVEEDOR FICTICIO','supplier_ruc','','invoice_number','E001-QA-3',
    'issue_date',current_date::text,'currency','PEN','total_amount',100,'tax_amount',0,'discount_amount',0,
    'items',jsonb_build_array(jsonb_build_object('description','QA FRACCION','quantity',1.000001,'unit','kg','unit_price',100,'subtotal',100)));
  perform public.confirm_invoice_data(d,payload);
  if (select quantity from public.invoice_items where invoice_id=d)<>1.000001
    then raise exception 'Se perdió precisión en la cantidad.'; end if;
  rejected:=false;
  begin perform public.confirm_invoice_data(bad,payload || '{"invoice_number":"E001-QA-4","total_amount":500}');
    exception when raise_exception then rejected:=true; end;
  if not rejected or (select count(*) from public.invoice_items where invoice_id=bad)<>0
    then raise exception 'Se aceptó una compra incoherente.'; end if;
  execute 'reset role';
end $$;
rollback;
select 'PASS: SUNAT, valor unitario exacto, referencia de cuatro decimales, cantidad fraccionaria, idempotencia y rechazo de totales incoherentes; datos de prueba revertidos' as verification;
