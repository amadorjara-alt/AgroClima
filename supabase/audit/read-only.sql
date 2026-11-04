-- Auditoría de solo lectura. Ejecutar con el propietario del proyecto correcto.
-- No recupera claves, ciphertext, correos ni contenido de comprobantes.
select schemaname,tablename,rowsecurity
from pg_tables
where schemaname='public' and tablename in
 ('businesses','profiles','invoices','invoice_items','products','suppliers','price_history','integration_credentials')
order by tablename;

select table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name in
 ('businesses','profiles','invoices','invoice_items','products','suppliers','price_history','integration_credentials')
order by table_name,ordinal_position;

select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where (schemaname='public' and tablename in
 ('businesses','profiles','invoices','invoice_items','products','suppliers','price_history','integration_credentials'))
 or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;

select table_name,grantee,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='integration_credentials'
 and grantee in ('anon','authenticated','service_role')
order by grantee,privilege_type;

select conrelid::regclass as table_name,conname,pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace='public'::regnamespace
 and conrelid in (
  select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('businesses','invoices','products','suppliers','price_history','integration_credentials')
 )
order by conrelid::regclass::text,conname;

select id,public,file_size_limit,allowed_mime_types
from storage.buckets where id='invoices';
