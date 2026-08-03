create table if not exists public.crm_integration_events (
  id text primary key,
  event_type text not null,
  event_version text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  result jsonb,
  error_code text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.crm_integration_nonces (
  key_id text not null,
  nonce text not null,
  request_timestamp timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (key_id, nonce)
);

create table if not exists public.crm_integration_acks (
  event_id text primary key references public.crm_integration_events(id) on delete cascade,
  received_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_integration_logs (
  id uuid primary key default gen_random_uuid(),
  request_at timestamptz not null default now(),
  ip text not null,
  method text not null,
  path text not null,
  event_id text,
  duration_ms integer not null,
  result text not null,
  error_code text
);

create index if not exists crm_integration_events_status_idx
  on public.crm_integration_events(status, created_at);
create index if not exists crm_integration_nonces_expiry_idx
  on public.crm_integration_nonces(expires_at);

alter table public.crm_integration_events enable row level security;
alter table public.crm_integration_nonces enable row level security;
alter table public.crm_integration_acks enable row level security;
alter table public.crm_integration_logs enable row level security;

revoke all on public.crm_integration_events from anon, authenticated;
revoke all on public.crm_integration_nonces from anon, authenticated;
revoke all on public.crm_integration_acks from anon, authenticated;
revoke all on public.crm_integration_logs from anon, authenticated;

create or replace function public.persist_crm_integration_state(changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  collection text;
  item jsonb;
begin
  foreach collection in array array['clients','quotes','invoices','payments','products','delivery_notes']
  loop
    for item in select value from jsonb_array_elements(coalesce(changes -> collection, '[]'::jsonb))
    loop
      if collection = 'clients' then
        insert into public.clients(id, data) values (item ->> 'id', item)
        on conflict (id) do update set data = excluded.data;
      elsif collection = 'quotes' then
        insert into public.quotes(id, data) values (item ->> 'id', item)
        on conflict (id) do update set data = excluded.data;
      elsif collection = 'invoices' then
        insert into public.invoices(id, data) values (item ->> 'id', item)
        on conflict (id) do update set data = excluded.data;
      elsif collection = 'payments' then
        insert into public.payments(id, data) values (item ->> 'id', item)
        on conflict (id) do update set data = excluded.data;
      elsif collection = 'products' then
        insert into public.products(id, data) values (item ->> 'id', item)
        on conflict (id) do update set data = excluded.data;
      elsif collection = 'delivery_notes' then
        insert into public.delivery_notes(id, data) values (item ->> 'id', item)
        on conflict (id) do update set data = excluded.data;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.persist_crm_integration_state(jsonb) from public, anon, authenticated;
grant execute on function public.persist_crm_integration_state(jsonb) to service_role;
