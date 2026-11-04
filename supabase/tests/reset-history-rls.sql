-- Todos los registros usados por el borrado pertenecen a negocios ficticios
-- creados aquí. ROLLBACK conserva intactos los datos reales del grupo.
begin;
do $$
declare
  a uuid; b uuid; ba uuid; ba2 uuid; bb uuid; ia uuid; draft uuid; ia2 uuid; ib uuid;
  pa uuid; pa2 uuid; pb uuid; sa uuid; request_id uuid; ids uuid[];
  rejected boolean; result jsonb; vault_before bigint; quotas_before bigint;
begin
  if has_function_privilege('anon','public.reset_purchase_history(uuid,text,uuid[])','EXECUTE')
    then raise exception 'La función permite ejecución anónima.'; end if;
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id<>a order by created_at limit 1;
  if a is null or b is null then raise exception 'Se requieren dos usuarios existentes.'; end if;
  select count(*) into vault_before from public.integration_credentials;
  insert into public.businesses(user_id,business_name) values(a,'QA REINICIO A') returning id into ba;
  insert into public.businesses(user_id,business_name) values(a,'QA OTRO NEGOCIO A') returning id into ba2;
  insert into public.businesses(user_id,business_name) values(b,'QA REINICIO B') returning id into bb;
  insert into public.products(user_id,business_id,name) values(a,ba,'QA PRODUCTO A') returning id into pa;
  insert into public.products(user_id,business_id,name) values(a,ba2,'QA PRODUCTO A2') returning id into pa2;
  insert into public.products(user_id,business_id,name) values(b,bb,'QA PRODUCTO B') returning id into pb;
  insert into public.suppliers(user_id,business_id,name) values(a,ba,'QA PROVEEDOR A') returning id into sa;
  insert into public.invoices(user_id,business_id,ocr_status,file_path,total_amount,currency)
    values(a,ba,'completed',a::text||'/'||ba::text||'/qa-completada.png',118,'PEN') returning id into ia;
  insert into public.invoices(user_id,business_id,ocr_status,file_path)
    values(a,ba,'review',a::text||'/'||ba::text||'/qa-borrador.png') returning id into draft;
  insert into public.invoices(user_id,business_id,ocr_status,file_path)
    values(a,ba2,'review',a::text||'/'||ba2::text||'/qa-otro-negocio.png') returning id into ia2;
  insert into public.invoices(user_id,business_id,ocr_status,file_path)
    values(b,bb,'review',b::text||'/'||bb::text||'/qa-ajeno.png') returning id into ib;
  insert into public.invoice_items(user_id,invoice_id,product_id,description,quantity,unit_price,subtotal)
    values(a,ia,pa,'QA COMPRA A',1,118,118),(a,ia2,pa2,'QA COMPRA A2',1,10,10),(b,ib,pb,'QA COMPRA B',1,20,20);
  insert into public.price_history(user_id,product_id,invoice_id,unit_price)
    values(a,pa,ia,118),(a,pa,null,120),(a,pa2,ia2,10),(b,pb,ib,20);
  insert into public.ocr_requests(user_id,invoice_id,outcome) values(a,ia,'review') returning id into request_id;
  select count(*) into quotas_before from public.ocr_requests where user_id=a;
  ids:=array[ia,draft];

  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  rejected:=false;
  begin perform public.reset_purchase_history(ba,'',ids); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Aceptó reinicio sin confirmación.'; end if;
  rejected:=false;
  begin perform public.reset_purchase_history(ba,'ELIMINAR',array[ia]); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Aceptó un historial incompleto.'; end if;
  rejected:=false;
  begin perform public.reset_purchase_history(ba,'ELIMINAR',array[ia,gen_random_uuid()]); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Aceptó otras compras con la misma cantidad.'; end if;
  rejected:=false;
  begin perform public.reset_purchase_history(bb,'ELIMINAR',array[ib]); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Aceptó borrar un negocio ajeno.'; end if;
  if (select count(*) from public.invoices where id=any(ids))<>2
    or (select count(*) from public.invoice_file_deletions where business_id=ba)<>0
    then raise exception 'El rechazo alteró facturas o dejó una cola parcial.'; end if;

  update public.invoices set ocr_status='processing',ocr_started_at=now() where id=draft;
  rejected:=false;
  begin perform public.reset_purchase_history(ba,'ELIMINAR',ids); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Permitió borrar un OCR en curso.'; end if;
  update public.invoices set ocr_status='review',ocr_started_at=null,
    file_path=a::text||'/'||ba2::text||'/qa-no-corresponde.png' where id=draft;
  rejected:=false;
  begin perform public.reset_purchase_history(ba,'ELIMINAR',ids); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Permitió borrar archivos de otra carpeta.'; end if;
  update public.invoices set file_path=a::text||'/'||ba::text||'/qa-borrador.png' where id=draft;

  result:=public.reset_purchase_history(ba,'ELIMINAR',ids);
  if result->>'success'<>'true' or (result->>'deleted_invoices')::integer<>2
    or (result->>'deleted_items')::integer<>1 or (result->>'deleted_prices')::integer<>2
    or (result->>'pending_files')::integer<>2 then raise exception 'Conteos del reinicio incorrectos: %',result; end if;
  if (select count(*) from public.invoices where id=any(ids))<>0
    or (select count(*) from public.invoice_items where invoice_id=ia)<>0
    or (select count(*) from public.price_history where product_id=pa)<>0
    then raise exception 'El historial quedó parcialmente borrado.'; end if;
  if not exists(select 1 from public.businesses where id=ba)
    or not exists(select 1 from public.products where id=pa)
    or not exists(select 1 from public.suppliers where id=sa)
    or not exists(select 1 from public.invoices where id=ia2)
    or not exists(select 1 from public.price_history where invoice_id=ia2)
    then raise exception 'El reinicio alteró el catálogo o el segundo negocio del propietario.'; end if;
  if (select count(*) from public.ocr_requests where user_id=a)<>quotas_before
    or (select invoice_id from public.ocr_requests where id=request_id) is not null
    then raise exception 'El reinicio permitió restablecer el consumo de OCR.'; end if;
  rejected:=false;
  begin perform public.reset_purchase_history(ba,'ELIMINAR',ids); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Aceptó repetir una confirmación obsoleta.'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.invoice_file_deletions where business_id=ba)<>0
    then raise exception 'Otro usuario puede ver la cola de archivos.'; end if;
  delete from public.invoice_file_deletions where business_id=ba;
  if not exists(select 1 from public.invoices where id=ib)
    or not exists(select 1 from public.price_history where invoice_id=ib)
    then raise exception 'Se alteró la compra del segundo usuario.'; end if;
  rejected:=false;
  begin insert into public.invoice_file_deletions(user_id,business_id,file_path)
    values(b,ba,b::text||'/'||ba::text||'/qa-intento-ajeno.png');
    exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Otro usuario puede insertar una limpieza ajena.'; end if;
  execute 'reset role';
  if (select count(*) from public.invoice_file_deletions where business_id=ba)<>2
    or (select count(*) from public.integration_credentials)<>vault_before
    then raise exception 'Se alteró la cola ajena o la bóveda.'; end if;
end $$;
rollback;
select 'PASS: confirmación explícita, snapshot exacto, OCR en curso, archivos, RLS entre usuarios y negocios, catálogo, claves y cuota conservados; fixtures revertidos' as verification;
