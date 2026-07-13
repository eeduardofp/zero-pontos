-- ─── FASE 2: campos do cliente exigidos pela geração de defesas ───
-- Rodar no Supabase: Dashboard → SQL Editor → New query → colar → Run.
-- cpf e nascimento já existem; estes completam o que a skill fazer-recurso
-- pergunta caso a caso hoje.

alter table clientes
  add column if not exists cnh      text,
  add column if not exists rg       text,
  add column if not exists endereco text,   -- rua, número, bairro, Cidade/UF
  add column if not exists cep      text,
  add column if not exists primario boolean; -- sem infrações nos últimos 12 meses
