-- Adiciona campo de vencimento da defesa prévia na tabela suspensoes
alter table suspensoes
  add column if not exists vencimento_defesa_previa date;
