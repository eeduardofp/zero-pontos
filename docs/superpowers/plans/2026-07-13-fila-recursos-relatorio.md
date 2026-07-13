# Exclusão de oportunidade, prazo automático, fila unificada e relatório de cliente — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar exclusão de oportunidade comercial, corrigir o prazo de AIT pra limpar automaticamente ao protocolar, unificar a Fila de Recursos com Suspensões (com prioridade visual), e gerar relatório Excel por cliente com seção "o que fazer" em linguagem simples.

**Architecture:** Workspace vanilla JS sem build/bundler (`app.js`/`data.js`/`comercial.js`/`suspensoes.js` carregados via `<script>` direto em `app.html`, cada módulo é uma IIFE ou coleção de funções globais). Sem framework de teste no workspace principal — lógica pura nova é validada via `node -e` (Node consegue avaliar `suspensoes.js` isoladamente porque suas funções de negócio não tocam DOM até serem chamadas). Comportamento que depende de DOM/login é verificado manualmente no navegador ao final.

**Tech Stack:** JavaScript vanilla (ES6+), Supabase JS v2, SheetJS (XLSX, já carregado via CDN em `app.html`).

---

## Convenção de verificação

Toda tarefa que só mexe em lógica pura (sem `document`/`Auth`/rede) é validada com `node --check` (sintaxe) + um script `node -e` que exercita a função real. Toda tarefa que mexe em render/modal/clique fica marcada `[verificação manual]` — o motivo é que o app inteiro fica atrás de login (`Auth.requireAuth()`), e não há como testar isso sem digitar a senha do Eduardo em uma tool call, o que é proibido. A Task 6 no final é o checklist de verificação manual completo, pra rodar com o Eduardo já logado.

---

### Task 1: Excluir oportunidade comercial

**Files:**
- Modify: `comercial.js:233-273` (função `abrirDetalhe`)
- Modify: `comercial.js:512-561` (adicionar função + exports)

- [ ] **Step 1: Adicionar `excluirOportunidade` em `comercial.js`**

Logo depois de `confirmarPerda` (linha 522, antes do comentário `// ── AUTOCOMPLETE ──`):

```js
  async function excluirOportunidade(id) {
    if (!confirm('Excluir esta oportunidade? Esta ação não pode ser desfeita.')) return
    try {
      const { error } = await db().from('oportunidades').delete().eq('id', id)
      if (error) throw error
      ops = ops.filter(o => o.id !== id)
      UI.closeModal()
      await render()
      UI.notif('Oportunidade excluída!')
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }
```

- [ ] **Step 2: Adicionar botão "Excluir" no modal de detalhe**

Em `comercial.js:271`, logo após o fechamento do bloco `${isAtiva ? ... : ...}` e antes do fechamento da template string (linha 272 `` `) ``), adicionar uma linha fixa de exclusão que aparece **sempre**, independente de `isAtiva`:

Trocar (linha 271):
```js
      ` : `<div style="color:var(--text3);font-size:13px">Esta oportunidade foi ${o.status === 'Convertida' ? 'convertida' : 'marcada como perdida'} em ${Data.fmtData(o.data_fechamento)}.</div>`}
    `)
```
por:
```js
      ` : `<div style="color:var(--text3);font-size:13px">Esta oportunidade foi ${o.status === 'Convertida' ? 'convertida' : 'marcada como perdida'} em ${Data.fmtData(o.data_fechamento)}.</div>`}
      <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
        <button class="btn btn-danger btn-sm" onclick="Comercial.excluirOportunidade('${id}')">🗑 Excluir oportunidade</button>
      </div>
    `)
```

- [ ] **Step 3: Exportar a função**

Em `comercial.js:553-560`, trocar:
```js
  return {
    render,
    abrirNovaOportunidade, abrirDetalhe,
    abrirConverter, abrirPerder, abrirEditar,
    salvarOportunidade, salvarEdicao, moverStatus,
    confirmarConverter, confirmarPerda,
    acFiltrar, acFechar
  }
```
por:
```js
  return {
    render,
    abrirNovaOportunidade, abrirDetalhe,
    abrirConverter, abrirPerder, abrirEditar,
    salvarOportunidade, salvarEdicao, moverStatus,
    confirmarConverter, confirmarPerda, excluirOportunidade,
    acFiltrar, acFechar
  }
```

- [ ] **Step 4: Checar sintaxe**

Run: `node --check comercial.js`
Expected: sem output (sucesso).

- [ ] **Step 5: Commit**

```bash
git add comercial.js
git commit -m "feat: excluir oportunidade comercial em qualquer status"
```

---

### Task 2: AIT — limpar vencimento automaticamente ao protocolar

**Files:**
- Modify: `app.js:874-915` (`openRecurso`, `confirmarRecurso`)

- [ ] **Step 1: Remover campo manual de prazo e limpar vencimento automaticamente**

Trocar o bloco inteiro `app.js:874-915`:

```js
function openRecurso(aid) {
  const a = Data.gAIT(aid); if (!a) return
  const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
  const prox = Data.proximaEtapa(a), ant = prox === 'JARI' ? 'Defesa Prévia' : 'JARI'
  const etKey = prox === 'JARI' ? 'jari' : 'segunda_instancia'
  UI.openModal(
    `<div class="modal-title">Protocolar recurso</div>
    <div class="modal-sub">${cl ? cl.nome : '—'} · ${pl ? pl.placa : '—'} · ${pl ? pl.renavan : '—'}</div>
    <div class="field-grid" style="margin:14px 0">
      <div class="field" style="grid-column:1/-1"><div class="field-label">AIT</div><div class="field-val mono" style="font-size:11px">${a.codigo}</div></div>
      <div class="field"><div class="field-label">Enquadramento</div><div class="field-val">${a.enquadramento || '—'}</div></div>
      <div class="field"><div class="field-label">${ant} (anterior)</div><div class="field-val" style="color:var(--red)">Indeferido</div></div>
      <div class="field"><div class="field-label">Recurso a fazer</div><div class="field-val" style="color:var(--blue);font-weight:500">${prox}</div></div>
      ${a.protocolo ? `<div class="field"><div class="field-label">Protocolo</div><div class="field-val mono">${a.protocolo}</div></div>` : ''}
      ${a.senha ? `<div class="field"><div class="field-label">Senha</div><div class="field-val mono">${a.senha}</div></div>` : ''}
    </div>
    <div class="info-box blue" style="margin-bottom:14px">Ao confirmar, <strong>${prox}</strong> será marcado como <strong>Aguardando</strong> e o prazo atual será limpo.</div>
    <div class="form-group" style="margin-bottom:14px">
      <label class="form-label">Observação</label>
      <input class="form-ctrl" id="rv-obs" value="${a.observacao || ''}" style="font-size:12px">
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="confirmarRecurso('${aid}','${etKey}')">✓ Recurso protocolado</button>
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
    </div>`
  )
}

async function confirmarRecurso(aid, etKey) {
  const a = Data.gAIT(aid); if (!a) return
  const fields = { [etKey]: 'Aguardando', vencimento: null, ultima_att: Data.today() }
  const obs = document.getElementById('rv-obs'); if (obs) fields.observacao = obs.value
  try {
    await API.updateAIT(aid, fields)
    Data.updateAITCache(aid, fields)
    UI.updateStats()
    UI.closeModal()
    renderRecursos()
    UI.notif('Recurso protocolado — AIT voltou para verificação!')
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}
```

Mudanças em relação ao original: removido o input `rv-venc` (prazo manual) e a linha do texto original que dizia "a AIT voltará para a fila de verificação" (o texto novo já cobre isso via "prazo atual será limpo"); `confirmarRecurso` agora sempre grava `vencimento: null` — nunca lê um campo de data do formulário.

- [ ] **Step 2: Checar sintaxe**

Run: `node --check app.js`
Expected: sem output (sucesso). (Vai falhar até a Task 4 estar completa, porque `renderRecursos` só existe hoje com a assinatura antiga — `node --check` só valida sintaxe, não referências, então isso passa mesmo antes da Task 4.)

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "fix: prazo de AIT limpa automaticamente ao protocolar recurso, sem campo manual"
```

---

### Task 3: Suspensões — lógica de pendência

**Files:**
- Modify: `suspensoes.js:76-84` (adicionar funções após `deveEncerrar`)
- Modify: `suspensoes.js:319-341` (adicionar `confirmarRecurso`)
- Modify: `suspensoes.js:440-444` (exports)

- [ ] **Step 1: Adicionar `precisaRecurso`, `proximaEtapa`, `getLista`, `garantirCarregado`, `getById`**

Em `suspensoes.js:76-83`, logo depois de `deveEncerrar` e antes de `nomeCliente`, trocar:

```js
  function deveEncerrar(s) {
    return s.defesa_previa === 'Deferido' || s.jari === 'Deferido' ||
           s.cetran === 'Deferido' || s.cetran === 'Indeferido' || s.cetran === 'Encerrado'
  }

  function nomeCliente(s) {
```
por:
```js
  function deveEncerrar(s) {
    return s.defesa_previa === 'Deferido' || s.jari === 'Deferido' ||
           s.cetran === 'Deferido' || s.cetran === 'Indeferido' || s.cetran === 'Encerrado'
  }

  // Só entra como pendência quando a etapa anterior está indeferida E o prazo
  // da próxima etapa é conhecido (senão a automação ainda não trouxe a data
  // do site — não faz sentido cobrar protocolo sem prazo real).
  function precisaRecurso(s) {
    if (s.encerrado) return false
    const defInd = s.defesa_previa === 'Indeferido'
    const jariVaz = !s.jari || s.jari === 'Não realizado'
    const jariInd = s.jari === 'Indeferido'
    const cetranVaz = !s.cetran || s.cetran === 'Não realizado'
    if (defInd && jariVaz) return !!s.vencimento_jari
    if (jariInd && cetranVaz) return !!s.vencimento_cetran
    return false
  }

  function proximaEtapa(s) {
    if (s.defesa_previa === 'Indeferido' && (!s.jari || s.jari === 'Não realizado')) return 'JARI'
    if (s.jari === 'Indeferido' && (!s.cetran || s.cetran === 'Não realizado')) return 'CETRAN'
    return null
  }

  function getLista() { return lista }

  async function garantirCarregado() {
    if (!lista.length) await loadSuspensoes()
  }

  function getById(id) { return gSus(id) }

  function nomeCliente(s) {
```

- [ ] **Step 2: Adicionar `confirmarRecurso` (limpa o vencimento certo, marca Aguardando)**

Em `suspensoes.js`, logo depois de `salvarEdicao` (que termina na linha 341, antes do comentário `// ── MODAL NOVA SUSPENSÃO ──`), adicionar:

```js
  // Protocolar recurso: marca a próxima etapa como Aguardando e limpa o
  // vencimento correspondente (JARI ou CETRAN, conforme etKey).
  async function confirmarRecurso(id, etKey) {
    const s = gSus(id); if (!s) return
    const vencKey = etKey === 'jari' ? 'vencimento_jari' : 'vencimento_cetran'
    const fields = { [etKey]: 'Aguardando', [vencKey]: null, ultima_att: Data.today() }
    try {
      await updateSuspensao(id, fields)
      UI.closeModal()
      if (typeof renderRecursos === 'function') renderRecursos()
      UI.notif('Recurso protocolado — suspensão voltou pra fila de verificação!')
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }
```

- [ ] **Step 3: Exportar as novas funções**

Em `suspensoes.js:440-444`, trocar:
```js
  return {
    render, renderLista, abrirDetalhe, abrirNova,
    acFiltrar, acFechar, sortBy
  }
})()
```
por:
```js
  return {
    render, renderLista, abrirDetalhe, abrirNova,
    acFiltrar, acFechar, sortBy,
    precisaRecurso, proximaEtapa, getLista, garantirCarregado, getById,
    confirmarRecurso, etapaAtual, statusAtual
  }
})()
```

(`etapaAtual`/`statusAtual` já existiam mas não eram exportadas — precisam estar públicas pra Task 5 usar no relatório.)

- [ ] **Step 4: Checar sintaxe**

Run: `node --check suspensoes.js`
Expected: sem output (sucesso).

- [ ] **Step 5: Validar `precisaRecurso`/`proximaEtapa` com Node puro (sem browser/login)**

Criar um script temporário em `C:\Users\eduar\AppData\Local\Temp\claude\C--Users-eduar-OneDrive-Documents-Zero-Pontos\0b0070e9-01a3-4052-a700-b9d1d8b9cc05\scratchpad\verificar-suspensoes.js`:

```js
// Avalia suspensoes.js isolado (as funções de negócio não tocam DOM até
// serem chamadas) e testa precisaRecurso/proximaEtapa com objetos fictícios.
const fs = require('fs')
const src = fs.readFileSync('C:/Users/eduar/dev/zero-pontos/suspensoes.js', 'utf8')
const Suspensoes = new Function(src + '\nreturn Suspensoes;')()

function assert(cond, msg) {
  if (!cond) { console.error('FALHOU: ' + msg); process.exitCode = 1 }
  else console.log('ok: ' + msg)
}

// DP indeferida + JARI vazia + SEM prazo → não entra na fila
assert(
  Suspensoes.precisaRecurso({ encerrado: false, defesa_previa: 'Indeferido', jari: null, vencimento_jari: null }) === false,
  'sem prazo conhecido não é pendência'
)

// DP indeferida + JARI vazia + COM prazo → entra na fila
assert(
  Suspensoes.precisaRecurso({ encerrado: false, defesa_previa: 'Indeferido', jari: null, vencimento_jari: '2026-08-01' }) === true,
  'com prazo conhecido é pendência'
)

// JARI já Aguardando (protocolada) → não é mais pendência, mesmo com prazo velho
assert(
  Suspensoes.precisaRecurso({ encerrado: false, defesa_previa: 'Indeferido', jari: 'Aguardando', vencimento_jari: '2026-08-01' }) === false,
  'JARI já protocolada não é pendência'
)

// JARI indeferida + CETRAN vazia + COM prazo → pendência de CETRAN
assert(
  Suspensoes.precisaRecurso({ encerrado: false, defesa_previa: 'Indeferido', jari: 'Indeferido', cetran: null, vencimento_cetran: '2026-09-01' }) === true,
  'CETRAN com prazo é pendência'
)

// proximaEtapa aponta pra etapa certa
assert(
  Suspensoes.proximaEtapa({ defesa_previa: 'Indeferido', jari: null }) === 'JARI',
  'proximaEtapa retorna JARI quando DP indeferida'
)
assert(
  Suspensoes.proximaEtapa({ defesa_previa: 'Indeferido', jari: 'Indeferido', cetran: null }) === 'CETRAN',
  'proximaEtapa retorna CETRAN quando JARI indeferida'
)
```

Run: `node "C:\Users\eduar\AppData\Local\Temp\claude\C--Users-eduar-OneDrive-Documents-Zero-Pontos\0b0070e9-01a3-4052-a700-b9d1d8b9cc05\scratchpad\verificar-suspensoes.js"`
Expected: 6 linhas `ok: ...`, `process.exitCode` continua 0 (nenhum `FALHOU`).

- [ ] **Step 6: Commit**

```bash
git add suspensoes.js
git commit -m "feat: logica de pendencia (precisaRecurso/proximaEtapa) e protocolar recurso para suspensoes"
```

---

### Task 4: Fila de recursos unificada (AITs + Suspensões)

**Files:**
- Modify: `app.js:333-354` (`renderRecursos`)
- Modify: `app.js` (adicionar `openRecursoSus` logo após `confirmarRecurso`, ~linha 916 pós-Task-2)
- Modify: `app.html:153` (renomear 2 cabeçalhos da tabela)

- [ ] **Step 1: Reescrever `renderRecursos` pra combinar AITs e Suspensões**

Trocar o bloco `app.js:333-354`:

```js
function renderRecursos() {
  const list = Data.getAITs().filter(Data.precisaRecurso)
    .sort((a, b) => {
      const ua = Data.urgLabel(a.vencimento).o, ub = Data.urgLabel(b.vencimento).o
      if (ua !== ub) return ua - ub
      return (Data.daysUntil(a.vencimento) || 9999) - (Data.daysUntil(b.vencimento) || 9999)
    })
  const body = document.getElementById('recursos-body')
  body.innerHTML = list.length ? list.map(a => {
    const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
    const prox = Data.proximaEtapa(a), u = Data.urgLabel(a.vencimento)
    return `<tr>
      <td class="bold">${cl ? cl.nome.split(' ').slice(0, 2).join(' ') : '—'}</td>
      <td style="font-family:var(--mono);font-size:11px">${pl ? pl.placa : '—'}<br><span style="color:var(--text3)">${pl ? pl.renavan : '—'}</span></td>
      <td style="font-family:var(--mono);font-size:11px;cursor:pointer;color:var(--blue)" onclick="openAIT('${a.id}')">${a.codigo.slice(0, 28)}</td>
      <td style="font-size:12px;color:var(--text3)">${(a.enquadramento || '—').slice(0, 22)}</td>
      <td><span class="badge b-blue">${prox}</span></td>
      <td style="font-family:var(--mono);font-size:12px">${a.vencimento || '—'}</td>
      <td><span class="badge ${u.c}">${u.t}</span></td>
      <td><button class="btn btn-primary btn-sm" onclick="openRecurso('${a.id}')">Protocolar</button></td></tr>`
  }).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Nenhum recurso pendente</td></tr>'
}
```

por:

```js
async function renderRecursos() {
  // Suspensões é uma página separada — se o usuário nunca abriu "Suspensões"
  // o cache dela está vazio. Garante que está carregado antes de montar a fila.
  await Suspensoes.garantirCarregado()

  const aitItens = Data.getAITs().filter(Data.precisaRecurso).map(a => {
    const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
    return {
      tipo: 'ait', id: a.id,
      cliente: cl ? cl.nome : '—',
      identificador: (pl ? pl.placa : '—') + '<br><span style="color:var(--text3)">' + (pl ? pl.renavan : '—') + '</span>',
      codigo: a.codigo, enquadramento: a.enquadramento || '—',
      prox: Data.proximaEtapa(a), prazo: a.vencimento
    }
  })

  const susItens = Suspensoes.getLista().filter(Suspensoes.precisaRecurso).map(s => {
    const cl = Data.gCliente(s.cliente_id)
    const prox = Suspensoes.proximaEtapa(s)
    return {
      tipo: 'suspensao', id: s.id,
      cliente: cl ? cl.nome : '—',
      identificador: 'Processo ' + (s.processo || '—'),
      codigo: s.processo || '—', enquadramento: 'Suspensão do direito de dirigir',
      prox, prazo: prox === 'JARI' ? s.vencimento_jari : s.vencimento_cetran
    }
  })

  const porUrgencia = (x, y) => (Data.daysUntil(x.prazo) ?? 9999) - (Data.daysUntil(y.prazo) ?? 9999)
  // Suspensão sempre antes de AIT — consequência maior pro cliente.
  const list = [...susItens.sort(porUrgencia), ...aitItens.sort(porUrgencia)]

  const body = document.getElementById('recursos-body')
  body.innerHTML = list.length ? list.map(item => {
    const u = Data.urgLabel(item.prazo)
    const tag = item.tipo === 'suspensao' ? '<span class="badge b-no" style="margin-right:6px">⚠ CNH</span>' : ''
    const acao = item.tipo === 'suspensao' ? `openRecursoSus('${item.id}')` : `openRecurso('${item.id}')`
    const codigoAtributos = item.tipo === 'ait'
      ? ` style="font-family:var(--mono);font-size:11px;cursor:pointer;color:var(--blue)" onclick="openAIT('${item.id}')"`
      : ` style="font-family:var(--mono);font-size:11px"`
    return `<tr>
      <td class="bold">${tag}${item.cliente.split(' ').slice(0, 2).join(' ')}</td>
      <td style="font-family:var(--mono);font-size:11px">${item.identificador}</td>
      <td${codigoAtributos}>${item.codigo.slice(0, 28)}</td>
      <td style="font-size:12px;color:var(--text3)">${item.enquadramento.slice(0, 22)}</td>
      <td><span class="badge b-blue">${item.prox}</span></td>
      <td style="font-family:var(--mono);font-size:12px">${item.prazo || '—'}</td>
      <td><span class="badge ${u.c}">${u.t}</span></td>
      <td><button class="btn btn-primary btn-sm" onclick="${acao}">Protocolar</button></td></tr>`
  }).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Nenhum recurso pendente</td></tr>'
}
```

- [ ] **Step 2: Adicionar `openRecursoSus` (modal de protocolar pra suspensão)**

Logo depois de `confirmarRecurso` (a função da Task 2, que termina no `}` antes da seção `// ─── EXCLUSÕES ───`), adicionar:

```js
function openRecursoSus(sid) {
  const s = Suspensoes.getById(sid); if (!s) return
  const cl = Data.gCliente(s.cliente_id)
  const prox = Suspensoes.proximaEtapa(s), ant = prox === 'JARI' ? 'Defesa Prévia' : 'JARI'
  const etKey = prox === 'JARI' ? 'jari' : 'cetran'
  UI.openModal(
    `<div class="modal-title">Protocolar recurso — Suspensão de CNH</div>
    <div class="modal-sub">${cl ? cl.nome : '—'} · Processo ${s.processo || '—'}</div>
    <div class="field-grid" style="margin:14px 0">
      <div class="field"><div class="field-label">${ant} (anterior)</div><div class="field-val" style="color:var(--red)">Indeferido</div></div>
      <div class="field"><div class="field-label">Recurso a fazer</div><div class="field-val" style="color:var(--blue);font-weight:500">${prox}</div></div>
      ${s.protocolo ? `<div class="field"><div class="field-label">Protocolo</div><div class="field-val mono">${s.protocolo}</div></div>` : ''}
      ${s.senha ? `<div class="field"><div class="field-label">Senha</div><div class="field-val mono">${s.senha}</div></div>` : ''}
    </div>
    <div class="info-box blue" style="margin-bottom:14px">Ao confirmar, <strong>${prox}</strong> será marcado como <strong>Aguardando</strong> e o prazo atual será limpo.</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="Suspensoes.confirmarRecurso('${sid}','${etKey}')">✓ Recurso protocolado</button>
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
    </div>`
  )
}
```

- [ ] **Step 3: Renomear cabeçalhos da tabela pra funcionar com os dois tipos**

Em `app.html:153`, trocar:
```html
    <table style="table-layout:fixed"><thead><tr><th style="width:18%">Cliente</th><th style="width:120px">Placa · Renavan</th><th style="width:22%">AIT</th><th>Enquadramento</th><th style="width:100px">Recurso</th><th style="width:90px">Prazo</th><th style="width:100px">Urgência</th><th style="width:100px"></th></tr></thead><tbody id="recursos-body"></tbody></table>
```
por:
```html
    <table style="table-layout:fixed"><thead><tr><th style="width:18%">Cliente</th><th style="width:120px">Identificador</th><th style="width:22%">Código</th><th>Enquadramento</th><th style="width:100px">Recurso</th><th style="width:90px">Prazo</th><th style="width:100px">Urgência</th><th style="width:100px"></th></tr></thead><tbody id="recursos-body"></tbody></table>
```

- [ ] **Step 4: Checar sintaxe**

`app.html` não é JS — não dá pra rodar `node --check` nele, só conferir visualmente que a linha 153 editada continua uma tag `<table>` válida (sem colchete/aspas quebrados). Run: `node --check app.js`
Expected: sem output (sucesso).

- [ ] **Step 5: Commit**

```bash
git add app.js app.html
git commit -m "feat: fila de recursos unificada (AITs + Suspensoes) com prioridade visual pra suspensao"
```

---

### Task 5: Relatório de cliente (Excel)

**Files:**
- Modify: `app.js:616-631` (`openCliente` — adicionar botão)
- Modify: `app.js` (adicionar `gerarRelatorioCliente` e `oQueFazer`, perto de `exportarSuspensoes`)

- [ ] **Step 1: Validar a lógica de `oQueFazer` isoladamente antes de integrar**

Criar script temporário `C:\Users\eduar\AppData\Local\Temp\claude\C--Users-eduar-OneDrive-Documents-Zero-Pontos\0b0070e9-01a3-4052-a700-b9d1d8b9cc05\scratchpad\verificar-oquefazer.js`:

```js
function oQueFazer(precisa, prox, prazo) {
  if (!precisa) return 'Aguardando decisão — nenhuma ação necessária no momento'
  const fmtData = d => d.split('-').reverse().join('/')
  return prazo
    ? `⚠ Protocolar recurso na ${prox} até ${fmtData(prazo)}`
    : `⚠ Protocolar recurso na ${prox} — prazo a definir`
}

function assert(cond, msg) {
  if (!cond) { console.error('FALHOU: ' + msg); process.exitCode = 1 }
  else console.log('ok: ' + msg)
}

assert(
  oQueFazer(false, null, null) === 'Aguardando decisão — nenhuma ação necessária no momento',
  'sem pendência → mensagem neutra'
)
assert(
  oQueFazer(true, 'JARI', '2026-08-10') === '⚠ Protocolar recurso na JARI até 10/08/2026',
  'com prazo → mensagem com data formatada'
)
assert(
  oQueFazer(true, 'CETRAN', null) === '⚠ Protocolar recurso na CETRAN — prazo a definir',
  'sem prazo mas pendente → mensagem sem data'
)
```

Run: `node "C:\Users\eduar\AppData\Local\Temp\claude\C--Users-eduar-OneDrive-Documents-Zero-Pontos\0b0070e9-01a3-4052-a700-b9d1d8b9cc05\scratchpad\verificar-oquefazer.js"`
Expected: 3 linhas `ok: ...`, sem `FALHOU`.

- [ ] **Step 2: Adicionar `gerarRelatorioCliente` e `oQueFazer` em `app.js`**

Logo depois do fechamento de `exportarSuspensoes` (linha 1056, `})`) e antes de `function calcEtapaSus`, adicionar:

```js
function oQueFazer(precisa, prox, prazo) {
  if (!precisa) return 'Aguardando decisão — nenhuma ação necessária no momento'
  return prazo
    ? `⚠ Protocolar recurso na ${prox} até ${Data.fmtData(prazo)}`
    : `⚠ Protocolar recurso na ${prox} — prazo a definir`
}

async function gerarRelatorioCliente(cid) {
  const c = Data.gCliente(cid); if (!c) return
  await Suspensoes.garantirCarregado()

  const aitsAll = Data.aitsDe(cid)
  const ativas = aitsAll.filter(a => !a.encerrado)
  const encerradas = aitsAll.filter(a => a.encerrado)
  const deferidas = encerradas.filter(a => Data.statusAtual(a) === 'Deferido').length
  const indeferidas = encerradas.filter(a => Data.statusAtual(a) === 'Indeferido').length
  const susAtivas = Suspensoes.getLista().filter(s => s.cliente_id === cid && !s.encerrado)

  const rows = []
  rows.push(['Relatório — ' + c.nome])
  rows.push(['Gerado em: ' + Data.fmtData(Data.today())])

  if (!ativas.length && !encerradas.length && !susAtivas.length) {
    rows.push([])
    rows.push(['Nenhuma AIT ou suspensão vinculada a este cliente.'])
  } else {
    rows.push([])
    rows.push(['AITs em andamento'])
    rows.push(['Código', 'Enquadramento', 'Placa', 'Etapa atual', 'Status', 'Prazo', 'O que fazer'])
    if (ativas.length) {
      ativas.forEach(a => {
        const pl = Data.gPlaca(a.placa_id)
        rows.push([
          a.codigo, a.enquadramento || '—', pl ? pl.placa : '—',
          Data.etapaAtual(a), Data.statusAtual(a), a.vencimento ? Data.fmtData(a.vencimento) : '—',
          oQueFazer(Data.precisaRecurso(a), Data.proximaEtapa(a), a.vencimento)
        ])
      })
    } else {
      rows.push(['Nenhuma AIT em andamento no momento.'])
    }

    rows.push([])
    rows.push(['Resumo de AITs encerradas'])
    rows.push(['Resultado', 'Quantidade'])
    rows.push(['Deferidas', deferidas])
    rows.push(['Indeferidas', indeferidas])

    if (susAtivas.length) {
      rows.push([])
      rows.push(['Suspensão de CNH'])
      rows.push(['Processo', 'Etapa atual', 'Status', 'Prazo', 'O que fazer'])
      susAtivas.forEach(s => {
        const prox = Suspensoes.proximaEtapa(s)
        const prazo = prox === 'JARI' ? s.vencimento_jari : s.vencimento_cetran
        rows.push([
          s.processo || '—', Suspensoes.etapaAtual(s), Suspensoes.statusAtual(s),
          prazo ? Data.fmtData(prazo) : '—',
          oQueFazer(Suspensoes.precisaRecurso(s), prox, prazo)
        ])
      })
    }
  }

  const nomeArquivo = 'Relatorio_' +
    c.nome.replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_') +
    '_' + Data.today() + '.xlsx'
  downloadExcel(rows, nomeArquivo)
  UI.notif('Relatório de ' + c.nome + ' gerado!')
}
```

- [ ] **Step 3: Adicionar botão "Relatório" no modal do cliente**

Em `app.js:616-630`, trocar:
```js
  UI.openModal(
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:3px">' +
    '<div class="modal-title">' + c.nome + '</div>' +
    '<button class="btn btn-ghost btn-sm" id="cl-edit-btn">✎ Editar</button>' +
    '<button class="btn btn-danger btn-sm" id="cl-del-btn">Excluir</button>' +
    '</div>' +
    '<div class="modal-sub">' + ativas + ' processos ativos · ' + aitsAll.length + ' total</div>' +
    contatoHTML + fatHTML +
    '<div style="margin-top:14px"><div class="section-title">Placas e AITs</div>' +
    (placasHTML || '<div style="color:var(--text3)">Nenhuma placa</div>') + '</div>'
  )
  const editBtn = document.getElementById('cl-edit-btn')
  if (editBtn) editBtn.onclick = function() { editarCliente(cid) }
  const delCliBtn = document.getElementById('cl-del-btn')
  if (delCliBtn) delCliBtn.onclick = function() { excluirCliente(cid) }
```
por:
```js
  UI.openModal(
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:3px;gap:6px;flex-wrap:wrap">' +
    '<div class="modal-title">' + c.nome + '</div>' +
    '<div style="display:flex;gap:6px">' +
    '<button class="btn btn-ghost btn-sm" id="cl-edit-btn">✎ Editar</button>' +
    '<button class="btn btn-ghost btn-sm" id="cl-rel-btn">📄 Relatório</button>' +
    '<button class="btn btn-danger btn-sm" id="cl-del-btn">Excluir</button>' +
    '</div>' +
    '</div>' +
    '<div class="modal-sub">' + ativas + ' processos ativos · ' + aitsAll.length + ' total</div>' +
    contatoHTML + fatHTML +
    '<div style="margin-top:14px"><div class="section-title">Placas e AITs</div>' +
    (placasHTML || '<div style="color:var(--text3)">Nenhuma placa</div>') + '</div>'
  )
  const editBtn = document.getElementById('cl-edit-btn')
  if (editBtn) editBtn.onclick = function() { editarCliente(cid) }
  const relBtn = document.getElementById('cl-rel-btn')
  if (relBtn) relBtn.onclick = function() { gerarRelatorioCliente(cid) }
  const delCliBtn = document.getElementById('cl-del-btn')
  if (delCliBtn) delCliBtn.onclick = function() { excluirCliente(cid) }
```

(Nota: a variável local dentro de `openCliente` chamada `ativas` no trecho acima é o **contador de AITs ativas** — `const ativas = aitsAll.filter(a => !a.encerrado).length` já existia antes do `openCliente`. Isso é uma variável diferente da constante `ativas` dentro de `gerarRelatorioCliente`, que é um **array**. São dois escopos de função separados, sem colisão real, mas repare a diferença de tipo se for reler o código depois.)

- [ ] **Step 4: Checar sintaxe**

Run: `node --check app.js`
Expected: sem output (sucesso).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: relatorio de cliente em Excel com AITs, resumo de encerradas, suspensao e o-que-fazer"
```

---

### Task 6: Verificação manual final (com Eduardo logado)

Não executável por mim sozinho — todo o app fica atrás de login e não vou digitar a senha do Eduardo em nenhuma tool call. Esta é a lista pra rodar com o Eduardo, depois de tudo commitado e no ar.

- [ ] **Step 1: Push de tudo**

```bash
git push origin main
```

- [ ] **Step 2: Pedir pro Eduardo verificar (checklist)**

1. Abrir uma oportunidade comercial em cada status (Aberta, Em negociação, Convertida, Perdida) → confirmar botão "🗑 Excluir oportunidade" aparece e funciona em todos.
2. Abrir uma AIT com etapa indeferida e prazo preenchido → clicar "Protocolar" na Fila de recursos → confirmar que o modal não tem mais campo de data manual, só observação → confirmar que a AIT some da fila e o prazo fica vazio (abrir a AIT de novo e ver "Vencimento: —" ou vazio).
3. Repetir o mesmo com uma Suspensão de CNH com etapa indeferida e vencimento_jari OU vencimento_cetran preenchido.
4. Na Fila de recursos, confirmar: suspensões pendentes aparecem **antes** das AITs, com a tag "⚠ CNH"; dentro de cada grupo, ordenado por urgência.
5. Abrir um cliente com AITs ativas + AITs encerradas + suspensão ativa → clicar "📄 Relatório" → abrir o `.xlsx` baixado → conferir as 4 seções (AITs em andamento, resumo de encerradas, suspensão, e a coluna "O que fazer" fazendo sentido).
6. Abrir um cliente sem nenhuma AIT/suspensão vinculada → gerar relatório → confirmar que não quebra, mostra "Nenhuma AIT ou suspensão vinculada a este cliente."

- [ ] **Step 3: Se algo falhar, reportar exatamente o que aconteceu (print/erro do console) pra eu corrigir**
