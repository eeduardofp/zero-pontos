# Tag "Pronta / Pendente" na Fila de recursos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar na célula Cliente de cada linha da Fila de recursos uma tag clicável `Pronta`/`Pendente`, com contador, e corrigir as colunas cortadas da tabela.

**Architecture:** Um campo novo `defesa_pronta_etapa` (texto, nulo) em `aits` e `suspensoes` guarda a etapa para a qual a defesa foi marcada pronta; a tag só aparece "Pronta" se esse texto for igual à `proximaEtapa()` atual (reset automático ao avançar de etapa). Lógica pura em `defesa-pronta.js` (testável em Node); UI em `renderRecursos()` com atualização otimista e rollback em erro.

**Tech Stack:** JS vanilla em `<script>` (sem build), Supabase (Postgres), CSS puro, `node --test` para a lógica pura.

**Spec:** `docs/superpowers/specs/2026-10-25-defesa-pronta-tag-design.md`

**Regras de segurança deste plano (não violar):**
- Só adicionar. Nenhum `DELETE`, nenhum `UPDATE` em massa, nenhum `DROP`.
- Trabalhar na branch `feat/defesa-pronta-tag`. **Não** fazer merge em `main` nem `git push` sem aprovação explícita do Eduardo (push em `main` publica o app via GitHub Pages).
- O SQL é rodado pelo Eduardo no Supabase, **antes** de testar/publicar.
- O teste manual escreve em UMA linha real e a devolve ao estado original.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `docs/sql/2026-10-25-defesa-pronta-etapa.sql` | criar | migração `ADD COLUMN` (Eduardo executa) |
| `defesa-pronta.js` | criar | lógica pura: `estado()` e `contar()` |
| `automacao/test/defesa-pronta.test.js` | criar | testes da lógica pura (rodam no `npm test` de `automacao/`) |
| `suspensoes.js` | modificar (`:491`) | exportar `updateSuspensao` |
| `app.js` | modificar (`:363-423`) | tag, contador, toggle, nova estrutura das células |
| `app.html` | modificar (`:8`, `:142-147`, `:347-348`) | larguras da tabela, contador, `<script>` novo, versões |
| `style.css` | modificar (após `:80`) | classes da tag, célula do cliente, ações, overflow da fila |

---

### Task 1: Migração SQL

**Files:**
- Create: `docs/sql/2026-10-25-defesa-pronta-etapa.sql`

- [ ] **Step 1: Criar o arquivo SQL**

```sql
-- Tag "Pronta/Pendente" da Fila de recursos.
-- Guarda a etapa para a qual a defesa foi marcada pronta (ex.: 'JARI').
-- Só ADICIONA uma coluna vazia: não altera nem apaga nenhum dado existente.
alter table aits
  add column if not exists defesa_pronta_etapa text;

alter table suspensoes
  add column if not exists defesa_pronta_etapa text;
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/eduar/OneDrive/Documents/Zero Pontos/repo/zero-pontos"
git add docs/sql/2026-10-25-defesa-pronta-etapa.sql
git commit -m "feat(db): coluna defesa_pronta_etapa em aits e suspensoes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: GATE — Eduardo executa o SQL (Claude NÃO executa)**

Pedir ao Eduardo: Supabase → projeto `ujftnixonlscpbfhnnnr` → SQL Editor → colar o conteúdo do arquivo → Run. Resposta esperada: `Success. No rows returned`.

- [ ] **Step 4: Confirmar a coluna (só leitura) no app já logado em produção**

Na aba de `https://app.zeropontos.com.br/app.html` (Chrome do Eduardo), executar no console da página:

```js
const c = Auth.getClient()
const a = await c.from('aits').select('id,defesa_pronta_etapa').limit(1)
const s = await c.from('suspensoes').select('id,defesa_pronta_etapa').limit(1)
({ aits: a.error ? a.error.message : 'ok', suspensoes: s.error ? s.error.message : 'ok' })
```

Esperado: `{ aits: 'ok', suspensoes: 'ok' }`. Se aparecer erro de coluna inexistente, o SQL não foi executado: **parar** e avisar o Eduardo.

---

### Task 2: Lógica pura `defesa-pronta.js` (TDD)

**Files:**
- Create: `automacao/test/defesa-pronta.test.js`
- Create: `defesa-pronta.js`

- [ ] **Step 1: Escrever o teste que falha**

`automacao/test/defesa-pronta.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert')
const DefesaPronta = require('../../defesa-pronta.js')

test('estado: nunca marcada (null) é pendente', () => {
  assert.strictEqual(DefesaPronta.estado(null, 'JARI'), 'pendente')
  assert.strictEqual(DefesaPronta.estado(undefined, 'JARI'), 'pendente')
  assert.strictEqual(DefesaPronta.estado('', 'JARI'), 'pendente')
})

test('estado: marcada para a etapa atual é pronta', () => {
  assert.strictEqual(DefesaPronta.estado('JARI', 'JARI'), 'pronta')
  assert.strictEqual(DefesaPronta.estado('2ª Instância', '2ª Instância'), 'pronta')
  assert.strictEqual(DefesaPronta.estado('CETRAN', 'CETRAN'), 'pronta')
})

test('estado: marcada para etapa anterior volta a pendente ao avançar', () => {
  assert.strictEqual(DefesaPronta.estado('Defesa Prévia', 'JARI'), 'pendente')
  assert.strictEqual(DefesaPronta.estado('JARI', '2ª Instância'), 'pendente')
})

test('estado: sem próxima etapa nunca é pronta', () => {
  assert.strictEqual(DefesaPronta.estado('JARI', null), 'pendente')
})

test('contar: totaliza prontas e pendentes', () => {
  const itens = [
    { marcada: 'JARI', prox: 'JARI' },
    { marcada: null, prox: 'JARI' },
    { marcada: 'Defesa Prévia', prox: 'JARI' },
    { marcada: 'CETRAN', prox: 'CETRAN' },
  ]
  assert.deepStrictEqual(DefesaPronta.contar(itens), { prontas: 2, pendentes: 2 })
})

test('contar: lista vazia', () => {
  assert.deepStrictEqual(DefesaPronta.contar([]), { prontas: 0, pendentes: 0 })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "C:/Users/eduar/OneDrive/Documents/Zero Pontos/repo/zero-pontos" && (cd automacao && node --test test/defesa-pronta.test.js)`
Expected: FAIL — `Cannot find module '../defesa-pronta.js'`.

- [ ] **Step 3: Implementar**

`defesa-pronta.js`:

```js
// ─── TAG "PRONTA / PENDENTE" DA FILA DE RECURSOS ─────────────
// Lógica pura (sem DOM, sem banco). Também carregável em Node para testes.
const DefesaPronta = (() => {
  // "pronta" só se a defesa foi marcada para a MESMA etapa que está pendente
  // agora. Se a AIT avançou de etapa, a marcação antiga deixa de valer.
  function estado(marcadaEtapa, proximaEtapa) {
    return marcadaEtapa && proximaEtapa && marcadaEtapa === proximaEtapa ? 'pronta' : 'pendente'
  }

  // itens: [{ marcada, prox }]
  function contar(itens) {
    let prontas = 0
    for (const i of itens) if (estado(i.marcada, i.prox) === 'pronta') prontas++
    return { prontas, pendentes: itens.length - prontas }
  }

  return { estado, contar }
})()

if (typeof module !== 'undefined' && module.exports) module.exports = DefesaPronta
```

- [ ] **Step 4: Rodar e ver passar**

Run: `(cd automacao && node --test test/defesa-pronta.test.js)`
Expected: `pass 6`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add defesa-pronta.js automacao/test/defesa-pronta.test.js
git commit -m "feat: lógica pura da tag Pronta/Pendente (estado e contagem)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Exportar `updateSuspensao`

**Files:**
- Modify: `suspensoes.js:491`

`updateSuspensao` já existe dentro do módulo (`suspensoes.js:22`) mas não é exportada; `app.js` precisa dela.

- [ ] **Step 1: Editar o `return` do módulo**

Trocar:

```js
    precisaRecurso, proximaEtapa, getLista, garantirCarregado, getById,
    confirmarRecurso, etapaAtual, statusAtual
```

por:

```js
    precisaRecurso, proximaEtapa, getLista, garantirCarregado, getById,
    confirmarRecurso, etapaAtual, statusAtual, updateSuspensao
```

- [ ] **Step 2: Conferir que o arquivo continua válido**

Run: `node --check suspensoes.js`
Expected: sem saída (exit 0).

- [ ] **Step 3: Commit**

```bash
git add suspensoes.js
git commit -m "refactor: exporta updateSuspensao de Suspensoes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: CSS da tag, da célula e da tabela da fila

**Files:**
- Modify: `style.css` (inserir logo após a linha `.b-blue{...}` em `:80`, antes de `/* FILTERS */`)

- [ ] **Step 1: Inserir o bloco**

```css
/* FILA DE RECURSOS — tag de defesa, célula do cliente, ações, tabela */
.cli-cell{display:flex;align-items:center;gap:6px;min-width:0}
.cli-cell .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.tag-defesa{flex:none;width:74px;text-align:center;font-size:11px;font-weight:500;font-family:var(--mono);padding:3px 0;border-radius:6px;border:1px solid transparent;cursor:pointer;user-select:none}
.tag-defesa.ok{background:var(--green-bg);color:var(--green);border-color:var(--green)}
.tag-defesa.no{background:var(--bg3);color:var(--text3);border-color:var(--border2)}
.tag-defesa:focus-visible{outline:2px solid var(--blue);outline-offset:1px}
.acoes-recurso{display:flex;gap:6px}
#pg-recursos .tbl-wrap{overflow-x:auto}
#tbl-recursos{min-width:1220px}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "style: tag de defesa, célula do cliente e tabela da fila sem corte

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: HTML da fila (larguras, contador, scripts)

**Files:**
- Modify: `app.html:8`, `app.html:142-147`, `app.html:347-348`

- [ ] **Step 1: Versionar o CSS (cache)** — `app.html:8`

Trocar `<link rel="stylesheet" href="style.css">` por:

```html
<link rel="stylesheet" href="style.css?v=r2">
```

- [ ] **Step 2: Cabeçalho e tabela da fila** — `app.html:142-147`

Trocar o bloco:

```html
    <div><div class="page-title">Fila de recursos</div><div class="page-sub">Recursos que precisam ser protocolados</div></div>
    <button class="btn btn-ghost btn-sm" onclick="renderRecursos()">↻ Atualizar</button>
  </div>
  <div class="tbl-wrap">
    <table style="table-layout:fixed"><thead><tr><th style="width:18%">Cliente</th><th style="width:120px">Identificador</th><th style="width:22%">Código</th><th>Enquadramento</th><th style="width:100px">Recurso</th><th style="width:115px">Prazo</th><th style="width:100px">Urgência</th><th style="width:170px"></th></tr></thead><tbody id="recursos-body"></tbody></table>
  </div>
```

por:

```html
    <div><div class="page-title">Fila de recursos</div><div class="page-sub">Recursos que precisam ser protocolados <span id="recursos-contador" style="margin-left:10px;color:var(--text3)"></span></div></div>
    <button class="btn btn-ghost btn-sm" onclick="renderRecursos()">↻ Atualizar</button>
  </div>
  <div class="tbl-wrap">
    <table id="tbl-recursos" style="table-layout:fixed"><thead><tr><th style="width:250px">Cliente</th><th style="width:110px">Identificador</th><th style="width:170px">Código</th><th>Enquadramento</th><th style="width:96px">Recurso</th><th style="width:110px">Prazo</th><th style="width:140px">Urgência</th><th style="width:210px"></th></tr></thead><tbody id="recursos-body"></tbody></table>
  </div>
```

- [ ] **Step 3: Scripts** — `app.html:347-348`

Trocar:

```html
<script src="app.js?v=r6"></script>
<script src="suspensoes.js?v=r6"></script>
```

por:

```html
<script src="defesa-pronta.js?v=r1"></script>
<script src="app.js?v=r7"></script>
<script src="suspensoes.js?v=r7"></script>
```

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "feat: larguras da fila, contador e script da tag de defesa

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `renderRecursos()` com tag, contador e toggle

**Files:**
- Modify: `app.js:363-423` (bloco `// ── RECURSOS` inteiro). `getIgnorados` e `ignorarRecurso` ficam **idênticos**.

- [ ] **Step 1: Substituir o bloco**

Trocar todo o trecho de `// ── RECURSOS ──...` até o fechamento de `renderRecursos()` (antes de `// ── FINANCEIRO`) por:

```js
// ── RECURSOS ──────────────────────────────────────────────────
function getIgnorados() {
  try { return JSON.parse(localStorage.getItem('zp-ignorados') || '[]') } catch { return [] }
}
function ignorarRecurso(tipo, id) {
  const ig = getIgnorados()
  const key = tipo + ':' + id
  if (!ig.includes(key)) ig.push(key)
  localStorage.setItem('zp-ignorados', JSON.stringify(ig))
  renderRecursos()
}

// Tag Pronta/Pendente: grava no item a etapa para a qual a defesa está pronta.
const _defesaEmVoo = new Set()

function defesaItem(tipo, id) {
  return tipo === 'suspensao' ? Suspensoes.getById(id) : Data.getAITs().find(a => a.id === id)
}

function defesaAplicarLocal(tipo, id, etapa) {
  if (tipo === 'suspensao') {
    const s = Suspensoes.getById(id)
    if (s) s.defesa_pronta_etapa = etapa
  } else {
    Data.updateAITCache(id, { defesa_pronta_etapa: etapa })
  }
}

async function toggleDefesaPronta(tipo, id) {
  const chave = tipo + ':' + id
  if (_defesaEmVoo.has(chave)) return
  const item = defesaItem(tipo, id)
  if (!item) return
  const prox = tipo === 'suspensao' ? Suspensoes.proximaEtapa(item) : Data.proximaEtapa(item)
  if (!prox) return
  const anterior = item.defesa_pronta_etapa || null
  const novo = DefesaPronta.estado(anterior, prox) === 'pronta' ? null : prox
  _defesaEmVoo.add(chave)
  defesaAplicarLocal(tipo, id, novo)
  renderRecursos()
  try {
    if (tipo === 'suspensao') await Suspensoes.updateSuspensao(id, { defesa_pronta_etapa: novo })
    else await API.updateAIT(id, { defesa_pronta_etapa: novo })
  } catch (e) {
    defesaAplicarLocal(tipo, id, anterior)
    renderRecursos()
    UI.notif('Erro ao salvar a tag: ' + e.message, 'error')
  } finally {
    _defesaEmVoo.delete(chave)
  }
}

async function renderRecursos() {
  await Suspensoes.garantirCarregado()
  const ignorados = new Set(getIgnorados())

  const aitItens = Data.getAITs().filter(Data.precisaRecurso).filter(a => !ignorados.has('ait:' + a.id)).map(a => {
    const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
    return {
      tipo: 'ait', id: a.id,
      cliente: cl ? cl.nome : '—',
      identificador: (pl ? pl.placa : '—') + '<br><span style="color:var(--text3)">' + (pl ? pl.renavan : '—') + '</span>',
      codigo: a.codigo, enquadramento: a.enquadramento || '—',
      prox: Data.proximaEtapa(a), prazo: a.vencimento,
      marcada: a.defesa_pronta_etapa || null
    }
  })

  const susItens = Suspensoes.getLista().filter(Suspensoes.precisaRecurso).filter(s => !ignorados.has('suspensao:' + s.id)).map(s => {
    const cl = Data.gCliente(s.cliente_id)
    const prox = Suspensoes.proximaEtapa(s)
    return {
      tipo: 'suspensao', id: s.id,
      cliente: cl ? cl.nome : '—',
      identificador: 'Processo ' + (s.processo || '—'),
      codigo: s.processo || '—', enquadramento: 'Suspensão do direito de dirigir',
      prox, prazo: prox === 'Defesa Prévia' ? s.vencimento_defesa_previa : prox === 'JARI' ? s.vencimento_jari : s.vencimento_cetran,
      marcada: s.defesa_pronta_etapa || null
    }
  })

  const porUrgencia = (x, y) => (Data.daysUntil(x.prazo) ?? 9999) - (Data.daysUntil(y.prazo) ?? 9999)
  // Suspensão sempre antes de AIT — consequência maior pro cliente.
  const list = [...susItens.sort(porUrgencia), ...aitItens.sort(porUrgencia)]

  const cont = document.getElementById('recursos-contador')
  if (cont) {
    const c = DefesaPronta.contar(list)
    cont.textContent = list.length ? c.prontas + ' prontas · ' + c.pendentes + ' pendentes' : ''
  }

  const body = document.getElementById('recursos-body')
  body.innerHTML = list.length ? list.map(item => {
    const u = Data.urgLabel(item.prazo)
    const tag = item.tipo === 'suspensao' ? '<span class="badge b-no">⚠ CNH</span>' : ''
    const pronta = DefesaPronta.estado(item.marcada, item.prox) === 'pronta'
    const alternar = `toggleDefesaPronta('${item.tipo}','${item.id}')`
    const tagDefesa = `<span class="tag-defesa ${pronta ? 'ok' : 'no'}" role="button" tabindex="0" aria-label="Defesa ${pronta ? 'pronta' : 'pendente'}. Clique para alternar" onclick="${alternar}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${alternar}}">${pronta ? 'Pronta' : 'Pendente'}</span>`
    const acao = item.tipo === 'suspensao' ? `openRecursoSus('${item.id}')` : `openRecurso('${item.id}')`
    const abreContexto = item.tipo === 'suspensao' ? `Suspensoes.abrirDetalhe('${item.id}')` : `openAIT('${item.id}')`
    const codigoAtributos = ` style="font-family:var(--mono);font-size:11px;cursor:pointer;color:var(--blue)" onclick="${abreContexto}"`
    return `<tr>
      <td class="bold"><div class="cli-cell">${tagDefesa}${tag}<span class="nm">${item.cliente.split(' ').slice(0, 2).join(' ')}</span></div></td>
      <td style="font-family:var(--mono);font-size:11px">${item.identificador}</td>
      <td${codigoAtributos}>${item.codigo.slice(0, 28)}</td>
      <td style="font-size:12px;color:var(--text3)">${item.enquadramento.slice(0, 22)}</td>
      <td><span class="badge b-blue">${item.prox}</span></td>
      <td style="font-family:var(--mono);font-size:12px;white-space:nowrap">${item.prazo || '—'}</td>
      <td><span class="badge ${u.c}">${u.t}</span></td>
      <td><div class="acoes-recurso"><button class="btn btn-primary btn-sm" onclick="${acao}">Protocolar</button><button class="btn btn-ghost btn-sm" onclick="ignorarRecurso('${item.tipo}','${item.id}')">Ignorar</button></div></td></tr>`
  }).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Nenhum recurso pendente</td></tr>'
}
```

- [ ] **Step 2: Conferir sintaxe e rodar testes**

Run: `node --check app.js && (cd automacao && node --test test/defesa-pronta.test.js)`
Expected: `--check` sem saída; testes `pass 6`.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: tag Pronta/Pendente e contador na fila de recursos

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificação no navegador (servidor local, banco real)

**Files:** nenhum (só verificação)

Pré-requisito: Task 1 Step 3 concluído (SQL executado).

- [ ] **Step 1: Subir o servidor local** — `preview_start` com `{name: "zero-pontos-web"}` (`.claude/launch.json`, porta 5173). Abrir `http://localhost:5173/app.html`.

- [ ] **Step 2: GATE — login pelo Eduardo.** O `localhost` é uma origem separada e não compartilha a sessão. **Pedir ao Eduardo que faça o login nessa aba. Claude não digita a senha.**

- [ ] **Step 3: Sem erros de console.** `read_console_messages` com `onlyErrors: true` → nenhum erro novo.

- [ ] **Step 4: Fila renderiza.** Abrir "Fila de recursos". Esperado: toda linha (AIT e suspensão) mostra `Pendente` (cinza) na ponta esquerda da célula Cliente; suspensões mostram também o selo `⚠ CNH`; contador mostra `0 prontas · N pendentes` com N = quantidade de linhas.

- [ ] **Step 5: Escolher UMA linha de teste e anotar o estado original.** Anotar cliente, código e o `ultima_att` dela (ver na tela de detalhe da AIT ou via console: `Data.getAITs().find(a => a.id === '<id>').ultima_att`).

- [ ] **Step 6: Alternar e persistir.** Clicar na tag da linha de teste → vira `Pronta` (verde), contador `1 prontas · N-1 pendentes`. Recarregar a página (F5) e voltar à fila → continua `Pronta`.

- [ ] **Step 7: `ultima_att` intacto.** Reler o `ultima_att` da linha de teste: deve ser idêntico ao anotado no Step 5. Se mudou, existe um trigger no Supabase: **parar** e avisar o Eduardo antes de seguir.

- [ ] **Step 8: Devolver ao estado original.** Clicar de novo na tag → `Pendente`; recarregar → continua `Pendente`.

- [ ] **Step 9: Teclado.** Tab até a tag e apertar Enter → alterna; Espaço → alterna de novo. Devolver a `Pendente`.

- [ ] **Step 10: Falha simulada.** No console: `API.updateAIT = async () => { throw new Error('teste') }` e clicar numa tag de AIT → a tag volta ao estado anterior e aparece o aviso `Erro ao salvar a tag: teste`. Recarregar a página para descartar a simulação.

- [ ] **Step 11: Larguras.** `resize_window` para 1920, 1440 e 1280 de largura. Em cada uma conferir: nenhum botão ("Protocolar"/"Ignorar") nem badge de urgência ("16d restantes") cortado; abaixo de ~1220 px aparece rolagem horizontal na tabela. Se algo ficar cortado, ajustar a largura da coluna correspondente em `app.html` (Task 5 Step 2) e/ou `min-width` em `style.css` (Task 4) e repetir. Tirar um screenshot de cada largura.

- [ ] **Step 12: Tema claro e escuro.** Alternar o tema (botão do topo) e conferir que `Pronta` e `Pendente` ficam legíveis nos dois.

- [ ] **Step 13: Outras telas intactas.** Abrir Hoje, AITs, Suspensões e Kanban; conferir que carregam e não têm erros no console.

- [ ] **Step 14: Parar o servidor** (`preview_stop`).

- [ ] **Step 15: Se houve ajuste de largura no Step 11, commitar:**

```bash
git add app.html style.css
git commit -m "style: ajusta larguras da fila após verificação

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Entrega (somente com aprovação do Eduardo)

- [ ] **Step 1: Mostrar ao Eduardo** o resumo (`git diff main --stat`) e os screenshots da Task 7.

- [ ] **Step 2: GATE — pedir aprovação explícita para publicar.** Sem "sim" claro, **parar aqui**.

- [ ] **Step 3: Publicar (só após o sim)**

```bash
git push -u origin feat/defesa-pronta-tag
git checkout main
git merge --no-ff feat/defesa-pronta-tag -m "feat: tag Pronta/Pendente na fila de recursos"
git push origin main
```

GitHub Pages publica em poucos minutos. Depois pedir ao Eduardo que dê Ctrl+F5 em `app.zeropontos.com.br` e confira a fila.

- [ ] **Step 4: Reversão, se necessário**

```bash
git revert -m 1 HEAD
git push origin main
```

A coluna `defesa_pronta_etapa` pode permanecer no banco sem efeito.

---

## Self-review (spec × plano)

| Requisito do spec | Onde |
|---|---|
| Campo novo nulo em `aits` e `suspensoes`, só `ADD COLUMN` | Task 1 |
| Pronta só se `defesa_pronta_etapa === proximaEtapa`; reset ao avançar | Task 2 (testes), Task 6 |
| Tag clicável na célula Cliente, ponta esquerda, CNH depois | Task 4, Task 6 |
| Atualização otimista, rollback + aviso em erro | Task 6, verificado no Step 10 da Task 7 |
| Usa `API.updateAIT` / `Suspensoes.updateSuspensao` + `Data.updateAITCache` | Task 3, Task 6 |
| Contador "N prontas · M pendentes" | Task 5 Step 2, Task 6 |
| Acessibilidade (role, teclado, aria-label) | Task 6, Step 9 da Task 7 |
| Larguras revistas, `min-width`, `overflow-x:auto` só na fila, `td` das ações sem `display:flex` | Task 4, Task 5, Task 6 |
| Versão dos scripts/CSS incrementada | Task 5 |
| Backup / branch / ordem SQL→código / reversão | topo do plano, Task 1, Task 8 |
| Outras telas inalteradas | Step 13 da Task 7 |

Nomes consistentes entre tasks: `DefesaPronta.estado/contar`, `toggleDefesaPronta`, `defesa_pronta_etapa`, `tag-defesa`, `cli-cell`, `acoes-recurso`, `tbl-recursos`, `recursos-contador`.
