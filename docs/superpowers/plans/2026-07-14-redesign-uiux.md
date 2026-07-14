# Redesign UI/UX (AIT Control) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformular a UI/UX do AIT Control com a identidade Zero Pontos (navy+dourado, tema claro/escuro), detalhe com abas, home "Hoje" priorizada, busca global, calendário e edição inline — sem tocar na camada de dados nem na automação.

**Architecture:** Vanilla JS (IIFEs) carregado por `<script>` no `app.html`, sem build. `style.css` reescrito como design system baseado em tokens CSS redefinidos por `[data-theme]`. Detalhe com abas reusa `UI.openModal`. Dois módulos novos (`home.js`, `calendario.js`) e helpers em `ui.js` (tema, abas, edição inline). Camada de dados (`data.js`/`api.js`/`auth.js`) e `automacao/`+`worker/` intactos.

**Tech Stack:** HTML/CSS/JS puro, Supabase JS v2, Sora + DM Mono (já carregados). Verificação: `node --check` nos JS + checklist manual autenticado (app é login-gated; não há como testar logado sem a senha do usuário).

**Spec:** `docs/superpowers/specs/2026-07-14-redesign-uiux-design.md`

---

## Estrutura de arquivos

- `style.css` — **reescrito**: tokens de tema, shell, sidebar, topbar, botões, badges, tabelas, painel de abas, stepper, campo inline, dropzone, calendário.
- `app.html` — **reestruturado**: sidebar agrupada, topbar (busca global + toggle tema + "+ Novo"), containers de página (renomear `pg-dashboard`→`pg-hoje`, add `pg-calendario`).
- `ui.js` — **estendido**: `UI.applyTheme`/`toggleTheme`, `UI.tabs`, `UI.inlineEdit`.
- `app.js` — **refatorado**: `nav()` novas páginas, `openAIT`/`openCliente` com abas, busca global.
- `suspensoes.js` — **refatorado**: `abrirDetalhe` com abas.
- `documentos.js` — **estendido**: renomear/editar tipo.
- `home.js` — **novo**: página "Hoje".
- `calendario.js` — **novo**: calendário + CRUD `compromissos`.
- `docs/sql/2026-07-14-compromissos.sql` — **novo**.

Cada fase = 1 task. Cada task deixa o app funcional.

---

### Task 1: Design system + tema claro/escuro + shell

**Files:**
- Modify: `style.css` (reescrever bloco `:root` e componentes de shell)
- Modify: `app.html` (sidebar agrupada + topbar)
- Modify: `ui.js` (tema)
- Modify: `app.js` (`initApp` aplica tema salvo)

- [ ] **Step 1: Tokens de tema no topo do `style.css`**

Substituir o `:root{...}` atual por:

```css
:root{
  --navy-900:#0A1828; --navy-800:#0D1F35; --navy-700:#162B47; --navy-600:#1E3A5C;
  --gold:#C9A84C; --gold-deep:#B8942A; --gold-soft:#F3EAD0;
  --bg:#F2F0EA; --surface:#FAFAF8; --surface-2:#F2F0EA;
  --text:#16202C; --text2:#5A6472; --text3:#8A93A1;
  --line:#E2DFD6; --line-strong:#CFC9BB;
  --blue:#1E3A5C; --blue-bg:#E7ECF2;
  --green:#2F8F5B; --green-bg:#E4F0E8;
  --amber:#B8942A; --amber-bg:#F6EDD4;
  --red:#C0483D; --red-bg:#F6E1DD;
  --sidebar-bg:var(--navy-900); --accent:var(--gold);
  --radius:8px; --radius-lg:12px;
  --font:'Sora',system-ui,sans-serif; --mono:'DM Mono',monospace;
}
:root[data-theme="dark"]{
  --navy-900:#070F18; --navy-800:#0C1826; --navy-700:#16283C; --navy-600:#22405E;
  --bg:#0B1420; --surface:#111C2B; --surface-2:#16273A;
  --text:#E7ECF3; --text2:#9AA7B8; --text3:#5F6E82;
  --line:#1E2E42; --line-strong:#2C3F58;
  --blue:#7FB3C4; --blue-bg:#16283C;
  --green:#5FBE86; --green-bg:#123123;
  --amber:#D9A85D; --amber-bg:#33280F;
  --red:#E0857A; --red-bg:#361C19;
  --sidebar-bg:var(--navy-900);
}
```

Depois, no restante do `style.css`, trocar toda referência antiga de fundo/borda para os tokens novos: `--bg2`→`--surface`, `--bg3`→`--surface-2`, `--border2`→`--line-strong`, `--blue2`→`--gold-deep` no primário. (Buscar e substituir; os nomes `--bg`, `--text`, `--text2`, `--text3`, `--border`, `--blue`, `--green`, `--amber`, `--red`, `--radius`, `--font`, `--mono`, badges `b-wait/b-ok/b-no/b-na` continuam válidos.)

- [ ] **Step 2: Sidebar navy + botão primário dourado**

No `style.css`, ajustar:

```css
#sidebar{background:var(--sidebar-bg)}
#sidebar .logo h1{color:#fff}
#sidebar .logo span{color:var(--gold)}
#sidebar .navsec{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#56637A;padding:14px 20px 6px}
#sidebar nav a{color:#AEB9C9}
#sidebar nav a:hover{background:rgba(255,255,255,.04);color:#fff}
#sidebar nav a.active{color:#fff;background:linear-gradient(90deg,rgba(201,168,76,.16),transparent);border-left-color:var(--gold)}
.btn-primary{background:var(--gold);color:var(--navy-900)}
.btn-primary:hover{background:var(--gold-deep)}
body{background:var(--bg);color:var(--text)}
```

- [ ] **Step 3: `app.html` — logo, sidebar agrupada e topbar**

Trocar a `.logo` e a `<nav>` (linhas 18–48) por grupos com `.navsec` e adicionar itens novos (`hoje`, `calendario`); trocar `dashboard`→`hoje`. Estrutura da nav:

```html
<div class="logo"><h1>Zero Pontos</h1><span>AIT CONTROL</span></div>
<nav>
  <div class="navsec">Operação</div>
  <a class="active" data-page="hoje" onclick="nav('hoje')">📊 Hoje</a>
  <a data-page="busca" onclick="nav('busca')">🔎 Busca geral</a>
  <a data-page="calendario" onclick="nav('calendario')">📅 Calendário</a>
  <a data-page="recursos" onclick="nav('recursos')">⚖ Fila de recursos</a>
  <div class="navsec">Cadastro</div>
  <a data-page="clientes" onclick="nav('clientes')">👤 Clientes</a>
  <a data-page="aits" onclick="nav('aits')">🚗 AITs</a>
  <a data-page="suspensoes" onclick="nav('suspensoes')">🪪 Suspensões</a>
  <div class="navsec">Gestão</div>
  <a data-page="comercial" onclick="nav('comercial')">💼 Comercial</a>
  <a data-page="financeiro" onclick="nav('financeiro')">💰 Financeiro</a>
  <a data-page="kanban" onclick="nav('kanban')">📋 Kanban</a>
</nav>
```

Renomear o container `id="pg-dashboard"` para `id="pg-hoje"` e adicionar antes do `#modal`:
```html
<div class="page" id="pg-calendario"><div id="calendario-root"></div></div>
```
Adicionar um topbar dentro de `#main`, no topo (antes das páginas):
```html
<div id="topbar">
  <div class="gsearch"><input id="global-q" placeholder="Buscar placa, código, cliente, CPF, documento…" oninput="buscaGlobal(this.value)" onkeydown="if(event.key==='Escape')this.value=''"><div id="global-results"></div></div>
  <button class="btn btn-ghost btn-sm" onclick="UI.toggleTheme()" id="theme-btn">🌙</button>
  <button class="btn btn-primary btn-sm" onclick="nav('cadastro')">+ Novo</button>
</div>
```
Manter o item `cadastro` como página (acessível pelo "+ Novo"), só remover do menu lateral.

- [ ] **Step 4: CSS do topbar + navsec + grupos**

```css
#topbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:12px;padding:12px 22px;background:var(--surface);border-bottom:1px solid var(--line)}
#topbar .gsearch{position:relative;flex:1;max-width:460px}
#topbar .gsearch input{width:100%;padding:9px 12px;background:var(--surface-2);border:1px solid var(--line-strong);border-radius:var(--radius);color:var(--text);font-family:var(--font);font-size:13px;outline:none}
#topbar .gsearch input:focus{border-color:var(--gold)}
#global-results{position:absolute;top:44px;left:0;right:0;background:var(--surface);border:1px solid var(--line-strong);border-radius:var(--radius);box-shadow:0 8px 30px rgba(10,24,40,.18);max-height:60vh;overflow:auto;display:none;z-index:60}
#global-results.open{display:block}
```

- [ ] **Step 5: Helper de tema em `ui.js`**

Adicionar dentro do IIFE `UI`, antes do `return`:

```js
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem('zp-theme', t)
  const b=document.getElementById('theme-btn'); if(b) b.textContent = t==='dark'?'☀️':'🌙'
}
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light'
  applyTheme(cur==='dark'?'light':'dark')
}
function initTheme(){ applyTheme(localStorage.getItem('zp-theme')||'light') }
```
E incluir `applyTheme, toggleTheme, initTheme` no `return {...}` do `UI`.

- [ ] **Step 6: Chamar `initTheme` no boot**

Em `app.js`, no início de `initApp()` (antes de `Auth.requireAuth`), adicionar:
```js
  UI.initTheme()
```
Em `app.js`, na função `nav()`, trocar `if (page === 'dashboard') renderDashboard()` por `if (page === 'hoje') Home.render()` — **mas** como `Home` só existe na Task 3, por ora manter `renderDashboard()` e apontar `'hoje'`:
```js
  if (page === 'hoje') renderDashboard()
```
E trocar a chamada inicial `nav('dashboard')` por `nav('hoje')`.

- [ ] **Step 7: Verificar sintaxe + commit**

Run: `node --check ui.js && node --check app.js`
Expected: sem saída.
```bash
git add style.css app.html ui.js app.js
git commit -m "feat(redesign): design system navy+gold, tema claro/escuro, shell e sidebar agrupada"
```

- [ ] **Step 8: CHECKPOINT usuário** — abrir o app, conferir visual novo (sidebar navy, dourado, tabelas), alternar tema no botão, navegar entre páginas sem erro no console.

---

### Task 2: Detalhe com abas (AIT, cliente, suspensão)

**Files:**
- Modify: `ui.js` (helper `UI.tabs`)
- Modify: `app.js` (`openAIT`, `openCliente`)
- Modify: `suspensoes.js` (`abrirDetalhe`)

- [ ] **Step 1: Helper de abas em `ui.js`**

Adicionar ao `UI` (antes do `return`):

```js
// Monta um painel de abas dentro do modal. abas = [{id,label,badge?,render:()=>html}]
function tabs(headerHtml, abas, ativa){
  const nav = abas.map(a=>`<div class="tab${a.id===ativa?' on':''}" data-tab="${a.id}" onclick="UI._tabGo('${a.id}')">${a.label}${a.badge!=null?` <span class="cnt">${a.badge}</span>`:''}</div>`).join('')
  UI._tabs = abas
  const corpo = (abas.find(a=>a.id===ativa)||abas[0]).render()
  openModal(`<div class="detail">${headerHtml}<div class="tabs">${nav}</div><div id="tab-body" class="panel">${corpo}</div></div>`)
}
function _tabGo(id){
  document.querySelectorAll('#modal .tab').forEach(t=>t.classList.toggle('on',t.dataset.tab===id))
  const a=(UI._tabs||[]).find(x=>x.id===id); if(a) document.getElementById('tab-body').innerHTML=a.render()
}
```
Incluir `tabs, _tabGo` no `return`.

- [ ] **Step 2: CSS das abas + stepper + detail (em `style.css`)**

```css
.detail .tabs{display:flex;gap:2px;border-bottom:1.5px solid var(--line);margin:18px 0 0}
.detail .tab{padding:10px 16px;font-size:13px;font-weight:600;color:var(--text2);border-bottom:2.5px solid transparent;margin-bottom:-1.5px;cursor:pointer}
.detail .tab.on{color:var(--text);border-bottom-color:var(--gold)}
.detail .tab .cnt{font-family:var(--mono);font-size:10px;background:var(--surface-2);border:1px solid var(--line);padding:0 6px;border-radius:10px}
.detail .panel{padding:20px 2px}
.stepper{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
.step{border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--surface)}
.step.done{border-color:var(--green);background:var(--green-bg)}
.step.now{border-color:var(--gold);background:var(--gold-soft);box-shadow:0 0 0 3px rgba(201,168,76,.12)}
.step .sl{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text2)}
.step .sv{font-weight:700;font-size:14px;margin-top:5px}
```

- [ ] **Step 3: `openAIT` com abas**

Reescrever `openAIT(aid)` em `app.js` para montar `header` (código + chips de etapa/status/urgência + botões Editar/Protocolar) e chamar `UI.tabs(header, [...], 'info')` com abas:
- `info`: stepper (usar `Data.etapaAtual`/`statusAtual` pra marcar `.done/.now`) + grade de campos (os mesmos campos hoje editáveis — reaproveitar o form de edição existente como corpo da aba).
- `docs`: `<div id="docs-box"></div>` e, após render, `Documentos.render('docs-box',{ait_id:aid})`.
- `prazos`: vencimento + `ultima_att`.
- `financeiro`: valor/pagamento/data_venda.

Manter os handlers existentes (`salvarEdicaoAIT`, `excluirAIT`, `openRecurso`). Como `UI.tabs` troca innerHTML ao mudar de aba, os documentos devem ser renderizados quando a aba `docs` abre — ajustar `_tabGo` não é preciso se a aba `info` for a inicial e a aba `docs` chamar `Documentos.render` via `render()` que retorna o container e um `setTimeout(()=>Documentos.render(...),0)`.

Exemplo do render da aba docs:
```js
{ id:'docs', label:'Documentos', render:()=>{ setTimeout(()=>Documentos.render('docs-box',{ait_id:aid}),0); return '<div id="docs-box"></div>' } }
```

- [ ] **Step 4: `openCliente` com abas**

Reescrever `openCliente(cid)` com header (nome + ações Editar/Relatório/Excluir/Fundir) e abas:
- `info`: dados do cliente (reusar exibição atual).
- `docs`: `setTimeout(()=>Documentos.render('docs-box-cli',{cliente_id:cid}),0)`.
- `casos`: placas & AITs (o HTML de placas atual).
- `suspensoes`: lista de suspensões do cliente (`Suspensoes.getLista().filter(s=>s.cliente_id===cid)`).
- `financeiro`: total + botão relatório.

- [ ] **Step 5: `Suspensoes.abrirDetalhe` com abas**

Reescrever para header + `UI.tabs` com abas `info` (stepper JARI/CETRAN + campos), `docs` (`Documentos.render('docs-box-sus',{suspensao_id:id})`), `prazos` (vencimento_jari/cetran).

- [ ] **Step 6: Verificar + commit**

Run: `node --check app.js && node --check suspensoes.js && node --check ui.js`
```bash
git add ui.js app.js suspensoes.js style.css
git commit -m "feat(redesign): detalhe com abas para AIT, cliente e suspensao"
```

- [ ] **Step 7: CHECKPOINT usuário** — abrir uma AIT, cliente e suspensão; conferir abas, troca de aba, documentos carregando na aba Documentos, edição salvando.

---

### Task 3: Home "Hoje"

**Files:**
- Create: `home.js`
- Modify: `app.html` (script tag + conteúdo de `#pg-hoje`)
- Modify: `app.js` (`nav('hoje')`→`Home.render()`)

- [ ] **Step 1: `home.js`**

```js
// ─── HOME "HOJE" ──────────────────────────────────────────────
const Home = (() => {
  function urgGrupo(prazo){
    const d = Data.daysUntil(prazo)
    if (d === null) return 3
    if (d < 0) return 0
    if (d <= 7) return 1
    if (d <= 30) return 2
    return 3
  }
  const TITULOS = ['Vencidos','Vence em até 7 dias','Vence em até 30 dias','Sem prazo definido']

  async function render(){
    await Suspensoes.garantirCarregado()
    const aits = Data.getAITs()
    const ativas = aits.filter(a=>!a.encerrado).length
    const verificar = aits.filter(a=>!a.encerrado && Data.daysSince(a.ultima_att)>=21).length
    const recursos = aits.filter(Data.precisaRecurso).length + Suspensoes.getLista().filter(Suspensoes.precisaRecurso).length
    const fat = aits.reduce((s,a)=>s+(a.valor||0),0)

    const itens = []
    aits.filter(Data.precisaRecurso).forEach(a=>{
      const pl=Data.gPlaca(a.placa_id), cl=pl?Data.gCliente(pl.cliente_id):null
      itens.push({tipo:'ait',id:a.id,cliente:cl?cl.nome:'—',cod:a.codigo,etapa:Data.proximaEtapa(a),prazo:a.vencimento})
    })
    Suspensoes.getLista().filter(Suspensoes.precisaRecurso).forEach(s=>{
      const cl=Data.gCliente(s.cliente_id), prox=Suspensoes.proximaEtapa(s)
      itens.push({tipo:'sus',id:s.id,cliente:cl?cl.nome:'—',cod:'Proc '+(s.processo||'—'),etapa:prox,prazo:prox==='JARI'?s.vencimento_jari:s.vencimento_cetran})
    })

    const grupos=[[],[],[],[]]
    itens.forEach(it=>grupos[urgGrupo(it.prazo)].push(it))
    grupos.forEach(g=>g.sort((a,b)=>(Data.daysUntil(a.prazo)??9999)-(Data.daysUntil(b.prazo)??9999)))

    const metric=(l,v,c)=>`<div class="metric"><div class="metric-label">${l}</div><div class="metric-val"${c?` style="color:${c}"`:''}>${v}</div></div>`
    const linha=it=>{
      const u=Data.urgLabel(it.prazo), tag=it.tipo==='sus'?'<span class="badge b-no" style="margin-right:6px">⚠ CNH</span>':''
      const acao=it.tipo==='sus'?`openRecursoSus('${it.id}')`:`openRecurso('${it.id}')`
      const abre=it.tipo==='sus'?`Suspensoes.abrirDetalhe('${it.id}')`:`openAIT('${it.id}')`
      return `<tr>
        <td class="bold" style="cursor:pointer" onclick="${abre}">${tag}${it.cliente.split(' ').slice(0,2).join(' ')}</td>
        <td style="font-family:var(--mono);font-size:11px;cursor:pointer" onclick="${abre}">${(it.cod||'').slice(0,26)}</td>
        <td><span class="badge b-blue">${it.etapa||'—'}</span></td>
        <td style="font-family:var(--mono);font-size:12px">${it.prazo||'—'}</td>
        <td><span class="badge ${u.c}">${u.t}</span></td>
        <td><button class="btn btn-primary btn-sm" onclick="${acao}">Protocolar</button></td></tr>`
    }
    const bloco=(i)=>grupos[i].length?`<div class="hoje-grupo"><div class="hoje-gt g${i}">${TITULOS[i]} · ${grupos[i].length}</div>
      <div class="tbl-wrap"><table><tbody>${grupos[i].map(linha).join('')}</tbody></table></div></div>`:''

    document.getElementById('pg-hoje').innerHTML =
      `<div class="page-head"><div class="page-title">Hoje</div><div class="page-sub">Prioridades por prazo</div></div>
       <div class="metrics">${metric('AITs ativas',ativas)}${metric('A verificar',verificar,'var(--amber)')}${metric('Recursos pendentes',recursos,'var(--red)')}${metric('Faturamento',Data.fmtMoeda(fat),'var(--green)')}</div>
       ${[0,1,2,3].map(bloco).join('') || '<div style="color:var(--text3);padding:20px">Nada pendente 🎉</div>'}`
  }
  return { render }
})()
```

- [ ] **Step 2: CSS (`style.css`)**

```css
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0 24px}
.metric{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:16px}
.metric-label{font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em}
.metric-val{font-size:24px;font-weight:700;margin-top:6px}
.hoje-grupo{margin-bottom:22px}
.hoje-gt{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:6px 10px;border-radius:6px;display:inline-block;margin-bottom:8px}
.hoje-gt.g0{background:var(--red-bg);color:var(--red)}
.hoje-gt.g1{background:var(--amber-bg);color:var(--amber)}
.hoje-gt.g2{background:var(--blue-bg);color:var(--blue)}
.hoje-gt.g3{background:var(--surface-2);color:var(--text3)}
```

- [ ] **Step 3: Ligar no `app.html` e `app.js`**

`app.html`: adicionar `<script src="home.js"></script>` após `documentos.js`; esvaziar o conteúdo estático de `#pg-hoje` (Home preenche).
`app.js`: em `nav()`, `if (page === 'hoje') Home.render()`.

- [ ] **Step 4: Verificar + commit**

Run: `node --check home.js && node --check app.js`
```bash
git add home.js app.html app.js style.css
git commit -m "feat(redesign): home Hoje com prioridades por prazo e metricas"
```

- [ ] **Step 5: CHECKPOINT usuário** — abrir o app: "Hoje" é a landing, mostra métricas e grupos de prazo; botões Protocolar e clique nas linhas funcionam.

---

### Task 4: Busca global + página de busca com filtros

**Files:**
- Modify: `app.js` (`buscaGlobal`, `renderBusca`)

- [ ] **Step 1: `buscaGlobal` (dropdown do topbar)**

Adicionar em `app.js`:
```js
function buscaGlobal(q){
  const box=document.getElementById('global-results'); if(!box) return
  q=(q||'').trim().toLowerCase()
  if(q.length<2){ box.classList.remove('open'); box.innerHTML=''; return }
  const cli=Data.getClientes().filter(c=>(c.nome||'').toLowerCase().includes(q)||(c.cpf||'').includes(q)).slice(0,6)
  const pls=Data.getPlacas().filter(p=>(p.placa||'').toLowerCase().includes(q)||(p.renavan||'').includes(q)).slice(0,6)
  const ait=Data.getAITs().filter(a=>(a.codigo||'').toLowerCase().includes(q)||(a.enquadramento||'').toLowerCase().includes(q)).slice(0,8)
  const sus=Suspensoes.getLista().filter(s=>(s.processo||'').toLowerCase().includes(q)).slice(0,6)
  const sec=(t,arr,fn)=>arr.length?`<div class="gr-sec">${t}</div>`+arr.map(fn).join(''):''
  box.innerHTML =
    sec('Clientes',cli,c=>`<div class="gr-item" onclick="openCliente('${c.id}');fecharBusca()">${c.nome}</div>`)+
    sec('Placas',pls,p=>{const cl=Data.gCliente(p.cliente_id);return `<div class="gr-item" onclick="openCliente('${p.cliente_id}');fecharBusca()">${p.placa} · ${cl?cl.nome:'—'}</div>`})+
    sec('AITs',ait,a=>`<div class="gr-item" onclick="openAIT('${a.id}');fecharBusca()"><span style="font-family:var(--mono)">${a.codigo}</span> · ${a.enquadramento||'—'}</div>`)+
    sec('Suspensões',sus,s=>`<div class="gr-item" onclick="Suspensoes.abrirDetalhe('${s.id}');fecharBusca()">Proc ${s.processo||'—'}</div>`)
    || '<div class="gr-item" style="color:var(--text3)">Nada encontrado</div>'
  box.classList.add('open')
}
function fecharBusca(){ const b=document.getElementById('global-results'); if(b){b.classList.remove('open');b.innerHTML=''} const q=document.getElementById('global-q'); if(q) q.value='' }
document.addEventListener('keydown',e=>{ if(e.key==='/'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();const q=document.getElementById('global-q');if(q)q.focus()} })
```
CSS:
```css
.gr-sec{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);padding:8px 12px 4px;font-family:var(--mono)}
.gr-item{padding:8px 12px;font-size:13px;cursor:pointer;border-top:1px solid var(--line)}
.gr-item:hover{background:var(--surface-2)}
```

- [ ] **Step 2: Página "Busca geral" com filtros**

Reescrever `renderBusca` (ou o handler de `pg-busca`) pra ter inputs de filtro (texto, tipo select, status select, ano) e renderizar uma tabela unificada dos resultados no cache local. Documentos por nome: consulta sob demanda `Auth.getClient().from('documentos').select('*').ilike('nome_arquivo','%'+q+'%')`.

- [ ] **Step 3: Verificar + commit**

Run: `node --check app.js`
```bash
git add app.js style.css
git commit -m "feat(redesign): busca global no topbar + pagina de busca com filtros"
```

- [ ] **Step 4: CHECKPOINT usuário** — digitar no topo (placa, código, nome, CPF); atalho `/`; clicar resultado abre o detalhe; página Busca geral filtra.

---

### Task 5: Calendário + tabela `compromissos`

**Files:**
- Create: `docs/sql/2026-07-14-compromissos.sql`
- Create: `calendario.js`
- Modify: `app.html` (script + `nav`)
- Modify: `app.js` (`nav('calendario')`→`Calendario.render()`)

- [ ] **Step 1: SQL (usuário roda)**

```sql
-- Rodar no Supabase SQL Editor.
create table if not exists compromissos (
  id text primary key,
  tipo text not null,           -- reuniao | protocolo | lembrete
  titulo text not null,
  data date not null,
  hora text,
  cliente_id text references clientes(id),
  ait_id text references aits(id),
  observacao text,
  concluido boolean default false,
  criado_por text,
  created_at timestamptz default now()
);
alter table compromissos enable row level security;
drop policy if exists "compromissos_auth_all" on compromissos;
create policy "compromissos_auth_all" on compromissos for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table compromissos to authenticated;
```

- [ ] **Step 2: `calendario.js`**

Módulo `Calendario` (IIFE) com: cache `let eventos=[]`; `async carregar()` que lê `compromissos` (via `Auth.getClient()`) e monta eventos automáticos dos vencimentos (AITs `vencimento`, suspensões `vencimento_jari/cetran`); `render()` desenha grade do mês (`mesAtual`), navegação `mes(+1/-1)`, `hoje()`; clique em dia abre criador de compromisso; clique em evento automático abre o caso (`openAIT`/`Suspensoes.abrirDetalhe`); CRUD `salvarCompromisso`/`excluirCompromisso` (genId `'k'`). Cor do evento por `Data.urgLabel`.

Estrutura mínima de `render()`:
```js
const Calendario = (() => {
  let eventos=[], ref=new Date()
  function genId(){ return 'k'+Date.now().toString(36)+Math.random().toString(36).slice(2,5) }
  async function carregar(){
    const { data } = await Auth.getClient().from('compromissos').select('*')
    eventos = (data||[]).map(c=>({...c, auto:false}))
    Data.getAITs().forEach(a=>{ if(a.vencimento && !a.encerrado) eventos.push({data:a.vencimento,titulo:'Vence recurso — '+a.codigo,auto:true,ait_id:a.id}) })
    await Suspensoes.garantirCarregado()
    Suspensoes.getLista().forEach(s=>{ ['vencimento_jari','vencimento_cetran'].forEach(k=>{ if(s[k]) eventos.push({data:s[k],titulo:'Vence '+(k.includes('jari')?'JARI':'CETRAN'),auto:true,sus_id:s.id}) }) })
  }
  async function render(){
    if(!eventos.length) await carregar()
    // desenhar grade do mês `ref`, marcando eventos por dia (implementação de grid)
    // ... (grid de 7 colunas, dias do mês, eventos filtrados por data)
  }
  return { render, carregar }
})()
```
(A grade de dias é HTML puro: cabeçalho dos meses + 42 células; cada célula lista `eventos.filter(e=>e.data===iso)`.)

- [ ] **Step 3: Ligar `app.html`/`app.js`**

`app.html`: `<script src="calendario.js"></script>`. `app.js`: `if (page === 'calendario') Calendario.render()`.

- [ ] **Step 4: Verificar + commit**

Run: `node --check calendario.js && node --check app.js`
```bash
git add docs/sql/2026-07-14-compromissos.sql calendario.js app.html app.js style.css
git commit -m "feat(redesign): calendario com vencimentos automaticos e compromissos manuais"
```

- [ ] **Step 5: CHECKPOINT usuário** — rodar o SQL; abrir Calendário; ver vencimentos; criar/editar/excluir compromisso; clicar evento automático abre o caso.

---

### Task 6: Edição inline + fusão de cliente + normalização

**Files:**
- Modify: `ui.js` (`UI.inlineEdit`)
- Modify: `documentos.js` (renomear/editar tipo)
- Modify: `app.js` (fundir cliente; aplicar inline nos campos)

- [ ] **Step 1: Helper `UI.inlineEdit`**

```js
// Torna um valor editável no lugar. onSave(novoValor) deve persistir e retornar Promise.
function inlineEdit(el, valorAtual, onSave, opts){
  opts=opts||{}
  const antigo=el.innerHTML
  const inp=document.createElement(opts.tipo==='select'?'select':'input')
  if(opts.tipo==='select'){ (opts.opcoes||[]).forEach(o=>{const op=document.createElement('option');op.value=o;op.textContent=o||'—';if(o===valorAtual)op.selected=true;inp.appendChild(op)}) }
  else { inp.type=opts.tipo||'text'; inp.value=valorAtual==null?'':valorAtual }
  inp.className='form-ctrl'; inp.style.fontSize='13px'
  el.innerHTML=''; el.appendChild(inp); inp.focus()
  let done=false
  const salvar=async()=>{ if(done)return; done=true; let v=inp.value; if(opts.upper)v=v.toUpperCase(); try{ await onSave(v) }catch(e){ UI.notif('Erro: '+e.message,'error'); el.innerHTML=antigo; return } }
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter')salvar(); if(e.key==='Escape'){done=true;el.innerHTML=antigo} })
  inp.addEventListener('blur',salvar)
}
```
Incluir `inlineEdit` no `return` do `UI`.

- [ ] **Step 2: Renomear/editar tipo em `documentos.js`**

Na linha de cada documento em `Documentos.render`, tornar o nome clicável pra renomear e o badge de tipo clicável pra trocar. Adicionar funções:
```js
async function renomear(docId, el){
  const d=await db().from('documentos').select('nome_arquivo').eq('id',docId).single()
  UI.inlineEdit(el, d.data.nome_arquivo, async v=>{ await db().from('documentos').update({nome_arquivo:v}).eq('id',docId); render(_containerId,_owner) })
}
async function mudarTipo(docId, el){
  const tipos=TIPOS[ownerKey()]
  UI.inlineEdit(el, el.textContent.trim(), async v=>{ await db().from('documentos').update({tipo:v}).eq('id',docId); render(_containerId,_owner) }, {tipo:'select',opcoes:tipos})
}
```
Expor `renomear, mudarTipo` no `return`. Nos elementos da lista, `onclick="event.stopPropagation();Documentos.renomear('${d.id}',this)"` no nome e idem no badge de tipo.

- [ ] **Step 3: Aplicar inline nos campos de AIT/cliente/suspensão**

Nas grades de campos (aba Informação), envolver cada valor num `<span class="fv" onclick="UI.inlineEdit(this,'valor',salvar,opts)">`. `salvar` chama o `API.update*`/supabase existente e atualiza cache. Placa/código com `{upper:true}`. Datas com `{tipo:'date'}`. Selects de etapa com `{tipo:'select',opcoes:['','Aguardando','Deferido','Indeferido','Não realizado']}`.

- [ ] **Step 4: Fundir cliente duplicado**

Adicionar em `app.js`:
```js
async function fundirCliente(cid){
  const nome=prompt('Fundir COM qual cliente? Digite parte do nome do cliente que vai PERMANECER:')
  if(!nome) return
  const alvos=Data.getClientes().filter(c=>c.id!==cid && (c.nome||'').toLowerCase().includes(nome.toLowerCase()))
  if(alvos.length!==1){ UI.notif(alvos.length?'Vários clientes batem, seja específico':'Nenhum cliente encontrado','error'); return }
  const alvo=alvos[0]
  if(!confirm(`Mover tudo de "${Data.gCliente(cid).nome}" para "${alvo.nome}" e apagar o duplicado?`)) return
  const db=Auth.getClient()
  try{
    await db.from('placas').update({cliente_id:alvo.id}).eq('cliente_id',cid)
    await db.from('suspensoes').update({cliente_id:alvo.id}).eq('cliente_id',cid)
    await db.from('documentos').update({cliente_id:alvo.id}).eq('cliente_id',cid)
    await db.from('clientes').delete().eq('id',cid)
    UI.notif('Clientes fundidos! Recarregando…')
    const dbAll=await API.loadAll(); Data.load(dbAll); UI.updateStats(); UI.closeModal(); openCliente(alvo.id)
  }catch(e){ UI.notif('Erro: '+e.message,'error') }
}
```
Botão "Fundir" no header do detalhe do cliente (Task 2, Step 4) chama `fundirCliente(cid)`.

- [ ] **Step 5: Verificar + commit + push**

Run: `node --check ui.js && node --check app.js && node --check documentos.js`
```bash
git add ui.js app.js documentos.js style.css
git commit -m "feat(redesign): edicao inline em tudo, renomear documento, fundir cliente"
git push origin main
```

- [ ] **Step 6: CHECKPOINT usuário** — editar campos inline (código, placa, data, valor, status), renomear documento e trocar tipo, fundir um cliente duplicado de teste. Confirmar persistência recarregando a página.

---

## Notas de verificação

- Sem framework de teste de UI. Cada task: `node --check` nos JS alterados + checklist manual autenticado (o app exige login; o assistente não tem a senha, então a verificação visual/funcional final é do usuário).
- Regenerar dados não é necessário; a camada de dados não muda (exceto a tabela nova `compromissos`).
- Ao fim de cada fase o app permanece utilizável — nenhuma fase deixa o app quebrado.
