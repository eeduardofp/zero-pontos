# Tag "Pronta / Pendente" na Fila de recursos — design

Data: 2026-10-25 · Status: aprovado pelo Eduardo (prévia visual aprovada)

## Problema

Defesas são adiantadas antes do prazo de protocolo. Na Fila de recursos não dá
para saber, de relance, quais já estão prontas e quais ainda faltam fazer. Só as
defesas que ainda não foram protocoladas aparecem na fila; ao protocolar, a
linha sai da fila. Portanto a marcação só importa dentro da fila.

Além disso, a tabela da fila tem colunas cortadas (botão "Ignorar" encosta na
borda, "16d restantes" perde o "s", textos truncados).

## Escopo

Dentro:
1. Tag `Pronta` / `Pendente` clicável na célula **Cliente** de cada linha da fila.
2. Contador "N prontas · M pendentes" acima da tabela.
3. Correção das larguras/overflow da tabela da fila.

Fora (não mexer):
- Qualquer outra tela (detalhe da AIT, Kanban, Suspensões, Hoje).
- O botão "Ignorar" e seu `localStorage` (comportamento atual preservado).
- Dados existentes: nenhum registro é alterado, movido ou apagado.

## Modelo de dados

Um campo novo, nulo por padrão, nas duas tabelas que alimentam a fila:

```sql
alter table aits       add column if not exists defesa_pronta_etapa text;
alter table suspensoes add column if not exists defesa_pronta_etapa text;
```

- Guarda o nome da etapa para a qual a defesa foi marcada pronta, no mesmo
  texto devolvido por `proximaEtapa()`: `Defesa Prévia`, `JARI`, `2ª Instância`
  (AIT) ou `Defesa Prévia`, `JARI`, `CETRAN` (suspensão).
- Estado exibido: **Pronta** se `defesa_pronta_etapa === proximaEtapa(item)`;
  caso contrário **Pendente**. Ao avançar de etapa a tag volta sozinha a
  Pendente, sem nenhum código de reset.
- `NULL` = nunca marcada = Pendente.
- Migração é só `ADD COLUMN`: não apaga nem altera dados. Tabelas já têm
  GRANT/RLS; coluna nova herda os privilégios da tabela.
- A automação do Detran (`automacao/supabase.js`) faz `update` parcial de
  campos específicos, então não sobrescreve a coluna nova.

## Comportamento

- Clique na tag alterna Pendente ↔ Pronta:
  - marcar pronta → grava `defesa_pronta_etapa = <etapa atual>`;
  - desmarcar → grava `NULL`.
- Atualização otimista: a tag muda na hora; a gravação ocorre em seguida via
  `API.updateAIT` (AIT) ou `Suspensoes.updateSuspensao` (suspensão), seguida de
  `Data.updateAITCache` (AIT). Falha na gravação → reverte a tag ao estado
  anterior e mostra `UI.notif('Erro: …', 'error')`.
- Não reordena nem filtra a lista; a ordem continua por urgência
  (suspensões antes de AITs).
- Contador atualiza a cada clique.
- Tag é um botão acessível (`role="button"`, teclado Enter/Espaço, `aria-label`).

## Layout

Célula Cliente: `[tag Pronta/Pendente] [⚠ CNH, se suspensão] NOME`. A tag fica
sempre na ponta esquerda (largura fixa) para alinhar verticalmente e permitir
varredura por cor. Verde = pronta; cinza = pendente. Cores via variáveis
existentes (`--green`/`--green-bg`, `--text3`/`--bg3`).

Tabela (`app.html`, `#pg-recursos`):
- Larguras revistas: Cliente maior (comporta tag + selo + nome); Urgência
  ≥ 135 px; coluna de ações ≥ 220 px.
- `table` com `min-width`; `.tbl-wrap` da fila com `overflow-x:auto` (nada fica
  escondido silenciosamente em tela estreita).
- `td` das ações: remover `display:flex` do `<td>` e usar um `<div>` interno.
- A alteração de `.tbl-wrap` é restrita à fila (não afeta as outras tabelas).

## Arquivos

- `docs/sql/2026-10-25-defesa-pronta-etapa.sql` — migração (rodada pelo Eduardo
  no SQL Editor do Supabase **antes** de publicar o código).
- `app.js` — `renderRecursos()` (tag, contador, estrutura da célula/ações) e
  função de alternância `toggleDefesaPronta(tipo, id)`.
- `app.html` — larguras do `<thead>` e wrapper da tabela da fila.
- `style.css` — classes `.tag-defesa`, `.tag-defesa.ok`, `.tag-defesa.no` e
  regra de overflow da fila.
- `app.html` / `app.js`: incrementar o `?v=` do script alterado (cache).

## Segurança dos dados

- Backup feito em 2026-10-23: arquivos do R2 (5.803, conferidos) e banco
  exportado (7 tabelas) em `C:\Users\eduar\Backups`.
- Trabalho em branch `feat/defesa-pronta-tag`; nada vai para `main` (e,
  portanto, para o ar via GitHub Pages) sem aprovação do Eduardo.
- Ordem de publicação: (1) SQL no Supabase, (2) merge do código. Se o código
  subir antes do SQL, a gravação falha e a tag reverte com aviso, sem perda.
- Reversão: reverter o commit. A coluna nova pode ficar vazia sem efeito.

## Verificação

Sem framework de testes no app (testes existem só em `automacao/`). Verificar
em navegador contra o app servido localmente:
1. Fila carrega; linhas das duas origens (AIT e suspensão) mostram a tag.
2. Clique em uma linha de teste: vira Pronta, recarregar mantém, clique de
   novo volta a Pendente; devolver a linha ao estado original ao terminar.
3. Falha simulada (coluna ausente / offline): tag reverte e mostra aviso.
4. Avançar etapa não é testado em dado real; coberto por revisão de código
   da comparação `defesa_pronta_etapa === proximaEtapa(item)`.
5. Larguras: conferir em 1920, 1440 e 1280 px que nenhuma coluna/botão fica
   cortado e que, abaixo do mínimo, aparece rolagem horizontal.
6. Outras telas (Hoje, AITs, Suspensões, Kanban) inalteradas.
