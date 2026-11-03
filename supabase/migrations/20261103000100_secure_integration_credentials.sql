-- Bóveda de credenciales de CompraSmart AI.
-- Las claves se cifran en la Edge Function con AES-256-GCM antes de llegar a esta tabla.
-- El navegador no recibe permisos de lectura/escritura sobre esta tabla.

create table if not exists public.integration_credentials (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null check (provider in ('gemini', 'openai', 'serpapi', 'firecrawl')),
    encrypted_key text not null,
    iv text not null,
    model text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint integration_credentials_user_provider_unique unique (user_id, provider)
);

alter table public.integration_credentials enable row level security;

-- Denegar acceso a los roles del cliente. Solo la Edge Function usa service_role.
revoke all on table public.integration_credentials from anon, authenticated;
grant all on table public.integration_credentials to service_role;

comment on table public.integration_credentials is
'Credenciales cifradas de integraciones. Acceso exclusivo desde funciones de servidor; nunca exponer al cliente.';
