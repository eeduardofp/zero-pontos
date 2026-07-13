-- ─── FASE 1: Tabela documentos (índice do cofre de arquivos R2) ───
-- Rodar no Supabase: Dashboard → SQL Editor → New query → colar → Run.
-- Cada linha representa um arquivo no bucket R2. O arquivo em si vive no
-- bucket; aqui fica o índice: a quem pertence, de que tipo é, onde está.

create table if not exists documentos (
  id            text primary key,
  -- dono do documento: pelo menos um dos três (check abaixo)
  cliente_id    text references clientes(id),    -- docs do titular: CNH, CRLV, procuração
  ait_id        text references aits(id),        -- docs do caso: NA, NP, defesa, parecer, comprovante
  suspensao_id  text references suspensoes(id),  -- docs de suspensão de CNH
  tipo          text not null,                   -- NA | NP | AIT | Defesa | Parecer | CNH | CRLV | Procuracao | Comprovante | Outro
  nome_arquivo  text not null,                   -- nome de exibição
  r2_key        text not null unique,            -- caminho do objeto no bucket
  tamanho_bytes bigint,
  mime          text default 'application/pdf',
  created_at    timestamptz not null default now(),
  criado_por    text,                            -- e-mail de quem subiu

  constraint documento_tem_dono check (
    cliente_id is not null or ait_id is not null or suspensao_id is not null
  )
);

create index if not exists idx_documentos_ait       on documentos(ait_id);
create index if not exists idx_documentos_cliente   on documentos(cliente_id);
create index if not exists idx_documentos_suspensao on documentos(suspensao_id);

-- Só usuário logado lê/escreve (mesmo padrão do resto do app)
alter table documentos enable row level security;

drop policy if exists "documentos_authenticated_all" on documentos;
create policy "documentos_authenticated_all" on documentos
  for all to authenticated
  using (true) with check (true);
