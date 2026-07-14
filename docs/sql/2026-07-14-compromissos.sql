-- ─── Calendário: tabela de compromissos manuais ───
-- Rodar no Supabase: SQL Editor → New query → colar → Run.
create table if not exists compromissos (
  id          text primary key,
  tipo        text not null,          -- reuniao | protocolo | lembrete
  titulo      text not null,
  data        date not null,
  hora        text,
  cliente_id  text references clientes(id),
  ait_id      text references aits(id),
  observacao  text,
  concluido   boolean default false,
  criado_por  text,
  created_at  timestamptz default now()
);
alter table compromissos enable row level security;
drop policy if exists "compromissos_auth_all" on compromissos;
create policy "compromissos_auth_all" on compromissos
  for all to authenticated using (true) with check (true);
-- GRANT obrigatório (padrão do projeto: RLS sozinho não basta)
grant select, insert, update, delete on table compromissos to authenticated;
