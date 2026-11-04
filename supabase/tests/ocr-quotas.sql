begin;
do $$
declare u uuid; b uuid; i uuid; v jsonb; rejected boolean;
begin
  select id into u from auth.users order by created_at limit 1;
  insert into public.businesses(user_id,business_name) values(u,'QA CUOTAS FICTICIAS') returning id into b;
  insert into public.invoices(user_id,business_id,ocr_status) values(u,b,'pending') returning id into i;
  execute 'set local role service_role';
  v:=public.begin_invoice_ocr(i,u);
  if v->>'request_id' is null then raise exception 'No se reservó el intento.'; end if;
  rejected:=false;
  begin perform public.begin_invoice_ocr(i,u); exception when raise_exception then
    if sqlerrm<>'OCR_BUSY' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Se permitió procesamiento simultáneo.'; end if;
  update public.invoices set ocr_status='review',ocr_draft='{"test":true}' where id=i;
  v:=public.begin_invoice_ocr(i,u);
  if v->>'cached'<>'true' then raise exception 'El borrador no se reutiliza.'; end if;
  update public.invoices set ocr_status='failed' where id=i;
  insert into public.ocr_requests(user_id,invoice_id,outcome)
    select u,i,'failed' from generate_series(1,20);
  rejected:=false;
  begin perform public.begin_invoice_ocr(i,u); exception when raise_exception then
    if sqlerrm<>'OCR_QUOTA' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'No se aplica el límite por usuario.'; end if;
  execute 'reset role';
end $$;
rollback;
select 'PASS: reserva, exclusión de intentos simultáneos, reutilización de borrador y cuota diaria' as verification;
