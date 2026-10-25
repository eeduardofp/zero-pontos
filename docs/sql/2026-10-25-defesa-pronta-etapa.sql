-- Tag "Pronta/Pendente" da Fila de recursos.
-- Guarda a etapa para a qual a defesa foi marcada pronta (ex.: 'JARI').
-- Só ADICIONA uma coluna vazia: não altera nem apaga nenhum dado existente.
alter table aits
  add column if not exists defesa_pronta_etapa text;

alter table suspensoes
  add column if not exists defesa_pronta_etapa text;
