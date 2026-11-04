-- Añade la acción; no ejecuta ningún reinicio ni elimina datos existentes.
-- El consumo de OCR se conserva aunque se elimine el comprobante.
alter table public.ocr_requests alter column invoice_id drop not null;
alter table public.ocr_requests drop constraint ocr_requests_invoice_id_fkey;
alter table public.ocr_requests add constraint ocr_requests_invoice_id_fkey
  foreign key (invoice_id) references public.invoices(id) on delete set null;

-- Storage se limpia mediante su API, nunca borrando storage.objects por SQL.
-- La cola sobrevive a errores de red o al cierre del navegador.
create table public.invoice_file_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  file_path text not null,
  created_at timestamptz not null default now(),
  unique (user_id, business_id, file_path)
);
create index invoice_file_deletions_business_idx on public.invoice_file_deletions(business_id);
alter table public.invoice_file_deletions enable row level security;
revoke all on public.invoice_file_deletions from public, anon, authenticated;
grant select, insert, delete on public.invoice_file_deletions to authenticated;
grant all on public.invoice_file_deletions to service_role;
create policy invoice_file_deletions_select on public.invoice_file_deletions
  for select to authenticated using (user_id=(select auth.uid()));
create policy invoice_file_deletions_delete on public.invoice_file_deletions
  for delete to authenticated using (user_id=(select auth.uid()));
create policy invoice_file_deletions_insert on public.invoice_file_deletions
  for insert to authenticated with check (
    user_id=(select auth.uid())
    and exists (select 1 from public.businesses b where b.id=business_id and b.user_id=(select auth.uid()))
    and left(file_path,length(user_id::text||'/'||business_id::text||'/'))=user_id::text||'/'||business_id::text||'/'
    and length(file_path)>length(user_id::text||'/'||business_id::text||'/')
    and strpos(substr(file_path,length(user_id::text||'/'||business_id::text||'/')+1),'/')=0
    and exists (select 1 from public.invoices i where i.user_id=(select auth.uid())
      and i.business_id=invoice_file_deletions.business_id and i.file_path=invoice_file_deletions.file_path)
  );

create function public.reset_purchase_history(p_business_id uuid, p_confirmation text, p_invoice_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  u uuid:=auth.uid(); ids uuid[]; item_count integer;
  price_count integer; removed integer; pending_files integer; prefix text;
begin
  if u is null then raise exception 'Inicia sesión para reiniciar el historial.'; end if;
  if p_confirmation is distinct from 'ELIMINAR' then raise exception 'Escribe ELIMINAR para confirmar.'; end if;
  if p_business_id is null or p_invoice_ids is null or cardinality(p_invoice_ids)<1
    then raise exception 'Carga el historial del negocio antes de confirmar.'; end if;

  -- El bloqueo del negocio también serializa las nuevas facturas por su FK.
  perform 1 from public.businesses where id=p_business_id and user_id=u for update;
  if not found then raise exception 'Negocio no encontrado o sin permiso.'; end if;
  begin
    perform 1 from public.invoices where business_id=p_business_id and user_id=u order by id for update nowait;
  exception when lock_not_available then
    raise exception 'Hay una compra en curso. Espera a que termine y vuelve a intentar.';
  end;
  if exists (select 1 from public.invoices where business_id=p_business_id and user_id=u
      and ocr_status='processing' and coalesce(ocr_started_at,created_at)>now()-interval '5 minutes')
    then raise exception 'Hay un OCR en curso. Espera a que termine antes de reiniciar.'; end if;

  select coalesce(array_agg(id),'{}'::uuid[]) into ids
    from public.invoices where business_id=p_business_id and user_id=u;
  -- Se compara el conjunto exacto, no solo la cantidad: un diálogo antiguo
  -- nunca puede eliminar compras nuevas que hayan sustituido a las anteriores.
  if cardinality(ids)<>cardinality(p_invoice_ids) or not (ids @> p_invoice_ids and p_invoice_ids @> ids) then
    raise exception 'El historial cambió. Recarga la página y revisa las compras antes de confirmar.';
  end if;
  prefix:=u::text||'/'||p_business_id::text||'/';
  if exists (select 1 from public.invoices where id=any(ids) and file_path is not null and
      (left(file_path,length(prefix))<>prefix or length(file_path)<=length(prefix)
        or strpos(substr(file_path,length(prefix)+1),'/')>0))
    then raise exception 'Hay un archivo fuera de la carpeta del negocio. No se reinició el historial.'; end if;
  if exists (select 1 from public.invoices i join public.invoices other on other.file_path=i.file_path
      and other.business_id is distinct from p_business_id
      where i.id=any(ids) and other.user_id=u)
    then raise exception 'Un archivo está asociado a otro negocio. Revisa sus comprobantes antes de reiniciar.'; end if;

  insert into public.invoice_file_deletions(user_id,business_id,file_path)
    select distinct u,p_business_id,file_path from public.invoices where id=any(ids) and file_path is not null
    on conflict (user_id,business_id,file_path) do nothing;
  delete from public.price_history h where h.user_id=u and
    (h.invoice_id=any(ids) or (h.invoice_id is null and exists
      (select 1 from public.products p where p.id=h.product_id and p.user_id=u and p.business_id=p_business_id)));
  get diagnostics price_count=row_count;
  delete from public.invoice_items where user_id=u and invoice_id=any(ids);
  get diagnostics item_count=row_count;
  delete from public.invoices where user_id=u and business_id=p_business_id and id=any(ids);
  get diagnostics removed=row_count;
  select count(*) into pending_files from public.invoice_file_deletions where user_id=u and business_id=p_business_id;
  return jsonb_build_object('success',true,'deleted_invoices',removed,'deleted_items',item_count,
    'deleted_prices',price_count,'pending_files',pending_files);
end $$;
revoke all on function public.reset_purchase_history(uuid,text,uuid[]) from public,anon;
grant execute on function public.reset_purchase_history(uuid,text,uuid[]) to authenticated;

comment on table public.invoice_file_deletions is 'Cola privada para eliminar archivos mediante Storage API después de un reinicio confirmado del historial.';
comment on function public.reset_purchase_history(uuid,text,uuid[]) is 'Elimina las compras y referencias del negocio del usuario conectado, sin borrar su catálogo, cuenta, claves ni consumo de OCR. Solo se llama tras confirmación explícita.';
