# Fase 2 — Aba Documentos (cofre R2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anexar, visualizar e excluir PDFs em AITs, clientes e suspensões no AIT Control, com arquivos num bucket R2 privado acessado por um Worker Cloudflare autenticado — sem nenhum token de API na mão do desenvolvedor (deploy manual via dashboard pelo usuário).

**Architecture:** O app (GitHub Pages) guarda o índice na tabela `documentos` (Supabase, já criada) e o binário no R2. O Worker `zp-docs` valida o JWT do Supabase (`/auth/v1/user`) e faz GET/PUT/DELETE no bucket via **binding nativo** (`env.DOCS`) — zero credenciais em código. O front tem um módulo novo `documentos.js` (IIFE `Documentos`, mesmo padrão dos demais) que renderiza a seção de documentos dentro dos modais existentes.

**Tech Stack:** Vanilla JS (IIFE, sem build), Supabase JS v2, Cloudflare Workers + R2 binding. Sem framework de teste no workspace — verificação por `node --check` + smoke com `curl` no Worker + checklist manual autenticado (usuário).

**Restrição de segurança:** repo é PÚBLICO. Nenhum segredo em arquivo commitado (a chave `sb_publishable_` já é pública por design; o Worker não tem segredos — o binding é configurado no dashboard).

---

### Task 1: Campos novos no cadastro de cliente (SQL — usuário roda)

**Files:**
- Create: `docs/sql/2026-07-13-clientes-campos-defesa.sql`

- [ ] **Step 1: Escrever o SQL**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/sql/2026-07-13-clientes-campos-defesa.sql
git commit -m "feat(fase2): SQL dos campos de defesa no cadastro de cliente"
```

- [ ] **Step 3: CHECKPOINT usuário — rodar o SQL no Supabase SQL Editor**

Verificação: no Table Editor, `clientes` mostra as colunas `cnh, rg, endereco, cep, primario`.

---

### Task 2: Worker `zp-docs` (código no repo — usuário cola no dashboard)

**Files:**
- Create: `worker/zp-docs.js`

- [ ] **Step 1: Escrever o Worker completo**

```js
// ─── zp-docs ─────────────────────────────────────────────────
// Proxy autenticado entre o AIT Control e o bucket R2 (zero-pontos-docs).
// Deploy: Cloudflare Dashboard → Workers → colar este arquivo.
// Binding obrigatório: R2 bucket "zero-pontos-docs" com nome de variável DOCS.
// Sem segredos: valida o JWT do usuário contra o Supabase Auth.

const SUPABASE_URL = 'https://ujftnixonlscpbfhnnnr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Q6P3CW3b7c0P1ENbvL1FFA_l60Ad-pA'
const ALLOWED_ORIGINS = [
  'https://app.zeropontos.com.br',
  'https://eeduardofp.github.io',
]
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB por arquivo

function corsHeaders(origin) {
  const o = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Vary': 'Origin',
  }
}

async function autenticado(request) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return false
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_KEY, Authorization: auth },
  })
  return r.status === 200
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const headers = corsHeaders(request.headers.get('Origin') || '')

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (url.pathname !== '/doc') return new Response('not found', { status: 404, headers })

    const key = url.searchParams.get('key') || ''
    // chave sempre no formato prefixo/id-do-dono/arquivo — nada de path traversal
    if (!/^(aits|clientes|suspensoes)\/[A-Za-z0-9._\-]+\/[A-Za-z0-9._\-]+$/.test(key)) {
      return new Response('chave inválida', { status: 400, headers })
    }
    if (!(await autenticado(request))) {
      return new Response('não autorizado', { status: 401, headers })
    }

    if (request.method === 'GET') {
      const obj = await env.DOCS.get(key)
      if (!obj) return new Response('não encontrado', { status: 404, headers })
      return new Response(obj.body, {
        headers: {
          ...headers,
          'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, max-age=60',
        },
      })
    }

    if (request.method === 'PUT') {
      const len = parseInt(request.headers.get('Content-Length') || '0', 10)
      if (len > MAX_BYTES) return new Response('arquivo acima de 25 MB', { status: 413, headers })
      await env.DOCS.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/pdf' },
      })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    if (request.method === 'DELETE') {
      await env.DOCS.delete(key)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    return new Response('método não suportado', { status: 405, headers })
  },
}
```

- [ ] **Step 2: Checar sintaxe**

O arquivo usa `export default` (módulo ES) — `node --check` só aceita isso em `.mjs`. Copiar para o scratchpad com extensão `.mjs` e checar:

Run: `cp worker/zp-docs.js "$SCRATCHPAD/zp-docs.mjs" && node --check "$SCRATCHPAD/zp-docs.mjs"`
Expected: sem output (sintaxe ok).

- [ ] **Step 3: Commit**

```bash
git add worker/zp-docs.js
git commit -m "feat(fase2): worker zp-docs — proxy autenticado do cofre R2"
```

- [ ] **Step 4: CHECKPOINT usuário — deploy pelo dashboard**

1. Cloudflare → **Workers & Pages** → **Create** → **Create Worker** → nome `zp-docs` → Deploy.
2. **Edit code** → apagar o hello world → colar `worker/zp-docs.js` inteiro → **Deploy**.
3. Voltar → aba **Settings** → **Bindings** → **Add** → **R2 bucket** → Variable name: `DOCS` → Bucket: `zero-pontos-docs` → Save (e Deploy de novo se pedir).
4. Copiar a URL (formato `https://zp-docs.<conta>.workers.dev`) e informar no chat.

- [ ] **Step 5: Smoke test do Worker (após URL informada)**

```bash
curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "https://zp-docs.<conta>.workers.dev/doc"       # esperado: 204
curl -s -o /dev/null -w "%{http_code}" "https://zp-docs.<conta>.workers.dev/doc?key=aits/x/y.pdf" # esperado: 401
curl -s -o /dev/null -w "%{http_code}" "https://zp-docs.<conta>.workers.dev/doc?key=../etc"       # esperado: 400
```

---

### Task 3: Módulo `documentos.js` + `WORKER_URL` no config

**Files:**
- Create: `documentos.js`
- Modify: `config.js` (adicionar constante)
- Modify: `app.html:348` (script tag depois de `api.js`... na prática após `suspensoes.js`; ordem indiferente — só precisa vir antes do uso em runtime)

- [ ] **Step 1: Adicionar WORKER_URL ao config.js**

```js
const WORKER_URL = '' // https://zp-docs.<conta>.workers.dev — preencher após deploy do Worker
```

- [ ] **Step 2: Criar documentos.js completo**

```js
// ─── DOCUMENTOS ───────────────────────────────────────────────
// Seção de documentos (cofre R2 via Worker zp-docs) nos modais de
// AIT, cliente e suspensão. Índice na tabela `documentos` (Supabase);
// binário no bucket. Um modal por vez → estado de owner é module-level.
const Documentos = (() => {
  const TIPOS = {
    ait_id:       ['NA', 'NP', 'AIT', 'Defesa', 'Parecer', 'Comprovante', 'Outro'],
    cliente_id:   ['CNH', 'CRLV', 'Procuracao', 'Outro'],
    suspensao_id: ['NA', 'NP', 'Defesa', 'Parecer', 'Comprovante', 'Outro'],
  }
  const PREFIXO = { ait_id: 'aits', cliente_id: 'clientes', suspensao_id: 'suspensoes' }

  let _owner = null        // { ait_id: id } | { cliente_id: id } | { suspensao_id: id }
  let _containerId = null

  function db() { return Auth.getClient() }
  function ownerKey() { return Object.keys(_owner)[0] }

  async function token() {
    const s = await Auth.getSession()
    return s ? s.access_token : null
  }

  async function listar() {
    const k = ownerKey()
    const { data, error } = await db().from('documentos')
      .select('*').eq(k, _owner[k]).order('created_at', { ascending: true })
    if (error) throw error
    return data
  }

  function fmtTamanho(b) {
    if (!b) return ''
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB'
    return Math.max(1, Math.round(b / 1024)) + ' KB'
  }

  async function render(containerId, owner) {
    _owner = owner
    _containerId = containerId
    const el = document.getElementById(containerId)
    if (!el) return
    if (!WORKER_URL) {
      el.innerHTML = '<div style="color:var(--text3);font-size:12px">Cofre ainda não configurado (WORKER_URL vazio no config.js).</div>'
      return
    }
    el.innerHTML = '<div style="color:var(--text3);font-size:12px">Carregando documentos…</div>'
    let docs
    try { docs = await listar() }
    catch (e) { el.innerHTML = '<div style="color:var(--red);font-size:12px">Erro ao listar: ' + e.message + '</div>'; return }

    const tipos = TIPOS[ownerKey()]
    const linhas = docs.map(d =>
      '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">' +
        '<span class="badge b-blue" style="min-width:64px;text-align:center">' + d.tipo + '</span>' +
        '<span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + d.nome_arquivo + '</span>' +
        '<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">' + fmtTamanho(d.tamanho_bytes) + '</span>' +
        '<button class="btn btn-ghost btn-sm" onclick="Documentos.abrir(\'' + d.id + '\')">Abrir</button>' +
        '<button class="btn btn-danger btn-sm" onclick="Documentos.excluir(\'' + d.id + '\')">✕</button>' +
      '</div>'
    ).join('')

    el.innerHTML =
      (docs.length ? linhas : '<div style="color:var(--text3);font-size:12px;padding:4px 0">Nenhum documento anexado.</div>') +
      '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">' +
        '<select class="form-ctrl" id="doc-tipo" style="width:auto;font-size:12px">' + tipos.map(t => '<option>' + t + '</option>').join('') + '</select>' +
        '<input type="file" id="doc-file" accept="application/pdf,image/*" style="font-size:12px;flex:1;min-width:160px">' +
        '<button class="btn btn-primary btn-sm" id="doc-up-btn" onclick="Documentos.upload()">Anexar</button>' +
      '</div>'
  }

  async function upload() {
    const input = document.getElementById('doc-file')
    const file = input && input.files[0]
    if (!file) { UI.notif('Escolha um arquivo', 'error'); return }
    const tipo = document.getElementById('doc-tipo').value
    const btn = document.getElementById('doc-up-btn')
    btn.disabled = true; btn.textContent = 'Enviando…'
    try {
      const t = await token()
      const k = ownerKey()
      const id = Data.genId('d')
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      const r2Key = PREFIXO[k] + '/' + _owner[k] + '/' + id + '.' + ext
      const resp = await fetch(WORKER_URL + '/doc?key=' + encodeURIComponent(r2Key), {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': file.type || 'application/pdf' },
        body: file,
      })
      if (!resp.ok) throw new Error('upload falhou (' + resp.status + ')')
      const { error } = await db().from('documentos').insert({
        id: id,
        [k]: _owner[k],
        tipo: tipo,
        nome_arquivo: file.name,
        r2_key: r2Key,
        tamanho_bytes: file.size,
        mime: file.type || 'application/pdf',
      })
      if (error) throw error
      UI.notif('Documento anexado!')
      render(_containerId, _owner)
    } catch (e) {
      UI.notif('Erro: ' + e.message, 'error')
      btn.disabled = false; btn.textContent = 'Anexar'
    }
  }

  async function abrir(docId) {
    try {
      const { data, error } = await db().from('documentos').select('*').eq('id', docId).single()
      if (error) throw error
      const t = await token()
      const resp = await fetch(WORKER_URL + '/doc?key=' + encodeURIComponent(data.r2_key), {
        headers: { Authorization: 'Bearer ' + t },
      })
      if (!resp.ok) throw new Error('download falhou (' + resp.status + ')')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  async function excluir(docId) {
    if (!confirm('Excluir este documento? O arquivo sai do cofre.')) return
    try {
      const { data, error } = await db().from('documentos').select('r2_key').eq('id', docId).single()
      if (error) throw error
      const t = await token()
      const resp = await fetch(WORKER_URL + '/doc?key=' + encodeURIComponent(data.r2_key), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + t },
      })
      if (!resp.ok) throw new Error('exclusão no cofre falhou (' + resp.status + ')')
      const { error: e2 } = await db().from('documentos').delete().eq('id', docId)
      if (e2) throw e2
      UI.notif('Documento excluído')
      render(_containerId, _owner)
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  return { render, upload, abrir, excluir }
})()
```

- [ ] **Step 3: Script tag no app.html**

Depois de `<script src="comercial.js"></script>` (linha ~349), adicionar:

```html
<script src="documentos.js"></script>
```

- [ ] **Step 4: Checar sintaxe**

Run: `node --check documentos.js && node --check config.js`
Expected: sem output.

- [ ] **Step 5: Commit**

```bash
git add documentos.js config.js app.html
git commit -m "feat(fase2): modulo Documentos (upload/abrir/excluir via worker R2)"
```

---

### Task 4: Integração nos modais (AIT, cliente, suspensão)

**Files:**
- Modify: `app.js` — `openAIT` (~linha 761), `openCliente` (~linha 611)
- Modify: `suspensoes.js` — `abrirDetalhe` (~linha 282)

- [ ] **Step 1: openAIT — seção Documentos antes do bloco Editar**

Em `openAIT`, localizar a linha:

```js
    '<div class="section-title" style="margin-bottom:10px">Editar</div>' +
```

Substituir por:

```js
    '<div class="section-title" style="margin-bottom:8px">Documentos</div>' +
    '<div id="docs-box" style="margin-bottom:16px"></div>' +
    '<div class="section-title" style="margin-bottom:10px">Editar</div>' +
```

E no fim de `openAIT`, depois de:

```js
  const aitDelBtn = document.getElementById('ait-del-btn')
  if (aitDelBtn) aitDelBtn.onclick = function() { excluirAIT(aid) }
```

adicionar:

```js
  Documentos.render('docs-box', { ait_id: aid })
```

- [ ] **Step 2: openCliente — seção Documentos antes de "Placas e AITs"**

Localizar em `openCliente`:

```js
    '<div style="margin-top:14px"><div class="section-title">Placas e AITs</div>' +
```

Substituir por:

```js
    '<div style="margin-top:14px"><div class="section-title">Documentos do titular</div>' +
    '<div id="docs-box-cli" style="margin-bottom:14px"></div></div>' +
    '<div style="margin-top:14px"><div class="section-title">Placas e AITs</div>' +
```

E no fim de `openCliente`, depois do wiring do `cl-del-btn`, adicionar:

```js
  Documentos.render('docs-box-cli', { cliente_id: cid })
```

- [ ] **Step 3: Suspensoes.abrirDetalhe — seção Documentos antes do bloco Editar**

Em `suspensoes.js`, no array `html` de `abrirDetalhe`, localizar:

```js
      '<div class="section-title" style="margin-bottom:10px">Editar</div>',
```

Substituir por:

```js
      '<div class="section-title" style="margin-bottom:8px">Documentos</div>',
      '<div id="docs-box-sus" style="margin-bottom:16px"></div>',
      '<div class="section-title" style="margin-bottom:10px">Editar</div>',
```

Depois da linha que faz `UI.openModal(html)` (e do wiring do `sus-save-btn`), adicionar:

```js
    Documentos.render('docs-box-sus', { suspensao_id: id })
```

- [ ] **Step 4: Checar sintaxe**

Run: `node --check app.js && node --check suspensoes.js`
Expected: sem output.

- [ ] **Step 5: Commit**

```bash
git add app.js suspensoes.js
git commit -m "feat(fase2): secao Documentos nos modais de AIT, cliente e suspensao"
```

---

### Task 5: Campos de defesa no cadastro e edição de cliente

**Files:**
- Modify: `app.html:197-202` (form Novo cliente)
- Modify: `app.js` — `salvarCliente` (~534), `editarCliente` (~666), `salvarEdicaoCliente` (~693), `openCliente` (exibição)

- [ ] **Step 1: app.html — inputs novos no form "Novo cliente"**

Depois da linha do `f-nascimento` (201) e antes do botão "Cadastrar cliente", adicionar:

```html
      <div class="form-row"><div><label class="form-label">CNH</label><input class="form-ctrl" id="f-cnh" placeholder="Nº de registro"></div>
      <div><label class="form-label">RG</label><input class="form-ctrl" id="f-rg" placeholder="0.000.000"></div></div>
      <div class="form-group"><label class="form-label">Endereço</label><input class="form-ctrl" id="f-endereco" placeholder="Rua, nº, bairro, Cidade/UF"></div>
      <div class="form-row"><div><label class="form-label">CEP</label><input class="form-ctrl" id="f-cep" placeholder="00000-000"></div>
      <div><label class="form-label">Primário (12m sem infração)</label><select class="form-ctrl" id="f-primario"><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></div></div>
```

- [ ] **Step 2: salvarCliente — coletar os campos**

No objeto `obj` de `salvarCliente`, depois de `nascimento: ...`, adicionar:

```js
    cnh:      document.getElementById('f-cnh').value.trim(),
    rg:       document.getElementById('f-rg').value.trim(),
    endereco: document.getElementById('f-endereco').value.trim(),
    cep:      document.getElementById('f-cep').value.trim(),
    primario: document.getElementById('f-primario').value === '' ? null : document.getElementById('f-primario').value === 'sim',
```

E na limpeza do form, trocar:

```js
    ;['f-nome', 'f-contato', 'f-email', 'f-cpf', 'f-nascimento'].forEach(id => document.getElementById(id).value = '')
```

por:

```js
    ;['f-nome', 'f-contato', 'f-email', 'f-cpf', 'f-nascimento', 'f-cnh', 'f-rg', 'f-endereco', 'f-cep', 'f-primario'].forEach(id => document.getElementById(id).value = '')
```

- [ ] **Step 3: editarCliente — inputs novos no modal de edição**

No array `parts`, depois do bloco CPF/nascimento (`'</div>',` da form-row) e antes do bloco dos botões, adicionar:

```js
    '<div class="form-row" style="margin-bottom:14px">',
    '<div><label class="form-label">CNH</label><input class="form-ctrl" id="ec-cnh" value="' + (c.cnh || '') + '"></div>',
    '<div><label class="form-label">RG</label><input class="form-ctrl" id="ec-rg" value="' + (c.rg || '') + '"></div>',
    '</div>',
    '<div class="form-group">',
    '<label class="form-label">Endereço</label>',
    '<input class="form-ctrl" id="ec-endereco" value="' + (c.endereco || '') + '" placeholder="Rua, nº, bairro, Cidade/UF"></div>',
    '<div class="form-row" style="margin-bottom:14px">',
    '<div><label class="form-label">CEP</label><input class="form-ctrl" id="ec-cep" value="' + (c.cep || '') + '"></div>',
    '<div><label class="form-label">Primário (12m sem infração)</label><select class="form-ctrl" id="ec-primario">' +
      '<option value="" ' + (c.primario === null || c.primario === undefined ? 'selected' : '') + '>—</option>' +
      '<option value="sim" ' + (c.primario === true ? 'selected' : '') + '>Sim</option>' +
      '<option value="nao" ' + (c.primario === false ? 'selected' : '') + '>Não</option>' +
    '</select></div>',
    '</div>',
```

- [ ] **Step 4: salvarEdicaoCliente — coletar os campos**

No objeto `fields`, depois de `nascimento: ...`, adicionar:

```js
    cnh:      document.getElementById('ec-cnh').value.trim(),
    rg:       document.getElementById('ec-rg').value.trim(),
    endereco: document.getElementById('ec-endereco').value.trim(),
    cep:      document.getElementById('ec-cep').value.trim(),
    primario: document.getElementById('ec-primario').value === '' ? null : document.getElementById('ec-primario').value === 'sim',
```

- [ ] **Step 5: openCliente — exibir CNH/endereço quando preenchidos**

Depois das linhas de `contatoHTML` existentes (`if (c.email) ...`), adicionar:

```js
  if (c.cnh)      contatoHTML += '<div style="margin-bottom:4px;font-size:13px">CNH: <span style="font-family:var(--mono)">' + c.cnh + '</span></div>'
  if (c.endereco) contatoHTML += '<div style="margin-bottom:4px;font-size:13px">Endereço: ' + c.endereco + (c.cep ? ' · CEP ' + c.cep : '') + '</div>'
```

- [ ] **Step 6: Checar sintaxe**

Run: `node --check app.js`
Expected: sem output.

- [ ] **Step 7: Commit e push**

```bash
git add app.html app.js
git commit -m "feat(fase2): campos de defesa (CNH, RG, endereco, CEP, primario) no cliente"
git push origin main
```

---

### Task 6: Ligar o WORKER_URL e verificação final (usuário + assistida)

- [ ] **Step 1: Usuário informa a URL do Worker** (Task 2 Step 4)

- [ ] **Step 2: Preencher WORKER_URL no config.js com a URL real, commit, push**

```bash
git add config.js
git commit -m "feat(fase2): aponta WORKER_URL para o worker zp-docs"
git push origin main
```

- [ ] **Step 3: Smoke via curl (sem login)** — comandos da Task 2 Step 5 (204 / 401 / 400).

- [ ] **Step 4: CHECKPOINT usuário — teste autenticado no app**

1. `app.zeropontos.com.br` → login → abrir uma AIT → seção **Documentos** aparece.
2. Anexar um PDF pequeno (tipo NA) → aparece na lista com tamanho.
3. **Abrir** → PDF abre em nova aba.
4. Abrir o cliente → **Documentos do titular** → anexar CNH → ok.
5. Abrir uma suspensão → seção Documentos → anexar e abrir → ok.
6. **Excluir** um documento → some da lista; no dashboard R2 o objeto sumiu.
7. Cadastro → Novo cliente mostra CNH/RG/Endereço/CEP/Primário; editar cliente idem.
