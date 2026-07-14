# Redesign UI/UX — AIT Control (Zero Pontos) — Design

**Data:** 2026-07-14
**Status:** aprovado (aguardando review do spec)

## Objetivo

Reformular completamente a UI/UX do workspace AIT Control: mais intuitivo, bonito, com a identidade visual da Zero Pontos. Manter as divisões existentes, adicionar home priorizada por prazo, detalhe com abas, busca global completa, calendário e edição inline de tudo (incluindo correção de inconsistências de dados). Sem tocar na camada de dados nem na automação.

## Princípios

- **Camada de dados intacta:** `config.js`, `auth.js`, `data.js`, `api.js` e todo `automacao/` + worker permanecem. O redesign é de apresentação.
- **Sem build:** continua vanilla JS (IIFEs) carregado por `<script>` no `app.html`. Sem bundler.
- **Identidade da marca:** navy profundo + dourado sobre branco quente — paleta real do site zeropontos.com.br.
- **Tudo editável:** qualquer dado exibido é corrigível no lugar onde aparece.

## Identidade visual (design system)

Tokens CSS em `:root`, redefinidos por `[data-theme="dark"]`. Toggle no topbar, persistido em `localStorage` (`zp-theme`). Padrão: claro.

**Paleta (tema claro):**
```
--navy-900:#0A1828  --navy-800:#0D1F35  --navy-700:#162B47  --navy-600:#1E3A5C
--gold:#C9A84C      --gold-deep:#B8942A  --gold-soft:#F3EAD0
--paper:#FAFAF8     --paper-2:#F2F0EA    --ink:#16202C  --ink-soft:#5A6472
--line:#E2DFD6      --line-strong:#CFC9BB
--ok:#2F8F5B/#E4F0E8  --wait:#B8942A/#F6EDD4  --no:#C0483D/#F6E1DD
```
**Tema escuro:** fundo `--navy-900`/`--navy-800`, texto claro, dourado como acento; semânticos ajustados para contraste. Sidebar é navy nos dois temas.

**Tipografia:** manter Sora (sans) + DM Mono (mono) já carregados, OU stack de sistema como fallback (fontes via CDN Google já em uso). Escala fixa; `tabular-nums` em colunas numéricas.

**Componentes base (reescritos em `style.css`):** sidebar agrupada, topbar com busca global + toggle tema + botão "+ Novo", botões (gold primário, ghost), badges de status, cards, tabelas densas, painel de detalhe com abas, stepper de etapas, campo editável inline, dropzone de documentos, grade de calendário.

## Navegação (IA)

Sidebar navy, 3 grupos:
- **OPERAÇÃO:** Hoje · Busca geral · Calendário · Fila de recursos
- **CADASTRO:** Clientes · AITs · Suspensões
- **GESTÃO:** Comercial · Financeiro · Kanban

O antigo item "Cadastro" (formulários) vira botão **+ Novo** no topbar (cliente/placa/AIT/suspensão/compromisso). O dashboard atual ("Visão geral") é absorvido pela home "Hoje".

## Telas

### Home "Hoje" (nova landing) — `home.js`
Primeira tela ao entrar. Seções:
1. **Faixa de métricas:** AITs ativas · a verificar (+21d) · recursos pendentes · faturamento do mês.
2. **Prioridades por prazo** (o núcleo), agrupadas: `Vencidos` → `Vence em ≤7 dias` → `≤30 dias` → `Sem prazo definido`. Fonte: AITs com `Data.precisaRecurso` + suspensões com `Suspensoes.precisaRecurso` + compromissos com data ≤ hoje. Cada linha: selo de urgência, cliente, código/processo, etapa atual, coluna "o que fazer" (próxima etapa + prazo), botão **Protocolar**. Suspensões com selo `⚠ CNH`, sempre no topo do grupo (regra atual preservada).
3. **Compromissos de hoje/amanhã** (do calendário): reuniões, protocolos agendados, lembretes.

Ordenação dentro de cada grupo: por `Data.daysUntil(prazo)` ascendente.

### Detalhe com abas (padrão reutilizável)
Substitui os modais atuais (`openAIT`, `openCliente`, `Suspensoes.abrirDetalhe`). Decisão: continua sendo **overlay modal** (reusa `UI.openModal`/`closeModal` e o container `#modal` já existente — sem introduzir roteamento), porém largo e com layout de abas: cabeçalho fixo (identificador + chips de estado + ações) e uma faixa de abas que troca o corpo. Estado da aba ativa é local ao painel.

- **AIT** (`openAIT` reescrito):
  - *Informação:* stepper das 3 etapas (Defesa Prévia → JARI → 2ª Instância) com estado colorido; grade de campos editáveis (código, enquadramento, placa/renavam via placa, protocolo/senha, vencimento, valor, observação).
  - *Documentos:* lista `documentos` (via `Documentos.render`), com renomear e trocar tipo inline; dropzone de upload.
  - *Prazos & histórico:* vencimento atual + timeline de mudanças (usa `ultima_att`; timeline completa é best-effort a partir dos campos existentes).
  - *Financeiro:* valor, pagamento, data da venda.
- **Cliente** (`openCliente` reescrito):
  - *Informação:* dados editáveis (nome, contato, e-mail, CPF, nascimento, CNH, RG, endereço, CEP, primariedade) + ação **Fundir com outro cliente** (para duplicados).
  - *Documentos do titular* · *AITs & placas* (agrupado por placa, como hoje) · *Suspensões* · *Financeiro* (total, relatório Excel).
- **Suspensão** (`Suspensoes.abrirDetalhe` reescrito):
  - *Informação:* stepper (Defesa Prévia → JARI → CETRAN) + campos editáveis.
  - *Documentos* · *Prazos* (vencimento_jari, vencimento_cetran).

### Busca global + página "Busca geral" — busca em `app.js`
- **Campo global** no topbar (atalho `/` foca). Busca conforme digita em: clientes (nome, CPF), placas (placa, renavam), AITs (código, enquadramento), suspensões (processo), documentos (nome_arquivo — requer consulta à tabela `documentos`). Dropdown de resultados agrupados por tipo; clique abre o detalhe.
- **Página "Busca geral":** versão expandida com filtros (tipo, status, etapa, ano, faixa de prazo) e resultados em tabela. Reaproveita a busca em cache local (clientes/placas/aits/suspensões já em memória); documentos por query sob demanda.

### Calendário — `calendario.js` + tabela `compromissos`
- Visão mês (padrão) e semana. Navegação anterior/próximo/hoje.
- **Eventos automáticos:** vencimentos de recurso das AITs (`vencimento`) e suspensões (`vencimento_jari`, `vencimento_cetran`), coloridos por urgência (vermelho vencido, âmbar ≤7d, etc.). Clique abre a AIT/suspensão.
- **Eventos manuais:** CRUD de `compromissos` (reunião, protocolo agendado, lembrete). Campos: `id, tipo, titulo, data, hora, cliente_id?, ait_id?, observacao, criado_por`. Clique abre o detalhe do compromisso (editar/excluir) e, se vinculado, link pro caso.

### Edição inline (transversal)
- Qualquer campo de dado tem estado de leitura + estado de edição. Hover mostra ✎; clique troca pra input/select; Enter (ou blur) salva via `API.update*`/supabase; Esc cancela. Atualiza cache local (`Data.update*Cache`) e re-renderiza.
- Cobre: campos de AIT, cliente, placa, suspensão, e **nome/tipo de documento** (update em `documentos`).
- **Normalização ao editar:** placa e código passam por máscara/uppercase ao salvar (reusa helpers de `automacao/mapeamento.js` portados pro front, ou equivalentes simples). Datas via input date.
- **Fusão de cliente duplicado:** ação na aba Informação do cliente → escolhe o cliente-alvo → repõe `placas.cliente_id`, `suspensoes.cliente_id`, `documentos.cliente_id` para o alvo e apaga o duplicado (mesma lógica do script `merge-exec` já validado).

## Modelo de dados (adições)

Única tabela nova:
```sql
create table compromissos (
  id          text primary key,
  tipo        text not null,          -- reuniao | protocolo | lembrete
  titulo      text not null,
  data        date not null,
  hora        text,                   -- HH:MM opcional
  cliente_id  text references clientes(id),
  ait_id      text references aits(id),
  observacao  text,
  concluido   boolean default false,
  criado_por  text,
  created_at  timestamptz default now()
);
alter table compromissos enable row level security;
create policy "compromissos_authenticated_all" on compromissos
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table compromissos to authenticated;
```
(GRANT obrigatório — padrão do projeto: RLS sozinho não basta.)

## Arquivos afetados

- **Reescrito:** `style.css` (design system completo), `app.html` (shell: sidebar agrupada, topbar, containers de página).
- **Refatorado:** `app.js` (render de páginas, detalhe com abas de AIT/cliente, busca global, edição inline), `suspensoes.js` (detalhe com abas), `documentos.js` (renomear/editar tipo), `comercial.js` e financeiro (reestilizar).
- **Novo:** `home.js` (Hoje), `calendario.js` (calendário + compromissos), helpers de edição inline (pode ser em `ui.js`).
- **SQL novo:** `docs/sql/2026-07-14-compromissos.sql`.
- **Intacto:** `config.js`, `auth.js`, `data.js`, `api.js`, `worker/`, `automacao/`.

## Fases de entrega (o plano detalha em tarefas)

1. **Design system + tema:** reescrever `style.css` com tokens navy+gold claro/escuro, toggle persistido, reestilizar shell/sidebar/topbar/botões/badges/tabelas. App continua funcional com o visual novo.
2. **Detalhe com abas:** componente de abas + reescrita de `openAIT`, `openCliente`, `Suspensoes.abrirDetalhe`.
3. **Home "Hoje":** `home.js`, vira landing, absorve métricas do dashboard.
4. **Busca global + página de busca:** campo no topbar + página com filtros.
5. **Calendário:** `calendario.js` + tabela `compromissos` (SQL) + CRUD.
6. **Edição inline + fusão/normalização:** helper inline aplicado em todos os campos e no nome/tipo de documento; ação de fundir cliente.

Cada fase deixa o app funcional e é verificável isoladamente. Verificação: `node --check` nos JS, e checklist manual autenticado pelo usuário (login-gated) ao fim de cada fase.

## Fora de escopo

- Kit de impressão / merge de PDF (descartado pelo usuário).
- Esteira "Preparar recurso" (fase futura, separada).
- Tela de detecção automática de inconsistências (usuário optou por edição inline apenas).
- Mudanças na automação/worker.
