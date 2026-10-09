create table if not exists public.charging_credentials (
  id integer primary key check (id = 1),
  encrypted_payload text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.credential_refresh (
  id integer primary key check (id = 1),
  status text not null default 'idle'
    check (status in ('idle', 'requested', 'working', 'completed', 'failed')),
  request_id uuid,
  source text,
  requested_at timestamptz,
  completed_at timestamptz,
  error_message text
);

insert into public.credential_refresh (id)
values (1)
on conflict (id) do nothing;

alter table public.charging_credentials enable row level security;
alter table public.credential_refresh enable row level security;

revoke all on table public.charging_credentials from anon, authenticated;
revoke all on table public.credential_refresh from anon, authenticated;
