# Automação Consulta de Recursos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Script local (atalho desktop) que consulta o dossiê de cada veículo no Detran Digital SC, extrai o resultado dos recursos de infração e atualiza as AITs no Supabase do workspace Zero Pontos.

**Architecture:** Node.js + Playwright com Chrome real e perfil persistente (sessão Detran sobrevive entre execuções). Lógica de negócio pura em `mapeamento.js` (testável sem browser). Parser do site desenvolvido contra fixtures de HTML real capturadas na Etapa 0 — o site do Detran é hostil a automação, então a Etapa 0 é um checkpoint obrigatório com o usuário antes de escrever o parser. Gravação no Supabase via `@supabase/supabase-js` com o mesmo login email/senha do workspace.

**Tech Stack:** Node.js 20+, Playwright (channel `chrome`), @supabase/supabase-js v2, dotenv, node:test.

**Spec:** `docs/superpowers/specs/2026-07-08-consulta-recursos-design.md`

**Working dir de todos os comandos:** `C:\Users\eduar\dev\zero-pontos`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `automacao/package.json` | deps + scripts |
| `automacao/.env.example` | template de credenciais (o `.env` real é gitignored) |
| `automacao/mapeamento.js` | regras puras: resultado site → status workspace, encerramento, datas |
| `automacao/supabase.js` | auth + carregar AITs ativas/placas/clientes + updateAIT |
| `automacao/captura.js` | Etapa 0: salva HTML real do dossiê em `fixtures/` |
| `automacao/detran.js` | Playwright: navegação + extração (recursos, débitos, erro de permissão) |
| `automacao/relatorio.js` | relatório HTML final |
| `automacao/index.js` | orquestrador CLI (`--dry-run`) |
| `automacao/Consultar Recursos.bat` | lançador para atalho no desktop |
| `automacao/test/mapeamento.test.js` | unit tests da lógica pura |
| `automacao/test/detran-parser.test.js` | parser vs fixtures |
| `automacao/fixtures/` | HTML capturado (versionado) |
| `automacao/chrome-profile/`, `automacao/logs/`, `automacao/.env` | locais, gitignored |

---

### Task 1: Scaffold do projeto

**Files:**
- Create: `automacao/package.json`
- Create: `automacao/.env.example`
- Create: `automacao/.gitignore`

- [ ] **Step 1: Criar `automacao/package.json`**

```json
{
  "name": "zero-pontos-automacao",
  "version": "1.0.0",
  "private": true,
  "description": "Consulta de recursos no Detran Digital SC e atualização do workspace",
  "scripts": {
    "test": "node --test test/",
    "captura": "node captura.js",
    "consultar": "node index.js",
    "dry-run": "node index.js --dry-run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "dotenv": "^16.4.5",
    "playwright": "^1.46.0"
  }
}
```

- [ ] **Step 2: Criar `automacao/.gitignore`**

```
node_modules/
chrome-profile/
logs/
.env
```

- [ ] **Step 3: Criar `automacao/.env.example`**

```
SUPABASE_URL=https://ujftnixonlscpbfhnnnr.supabase.co
SUPABASE_KEY=sb_publishable_Q6P3CW3b7c0P1ENbvL1FFA_l60Ad-pA
SUPABASE_EMAIL=seu-email-de-login-do-workspace
SUPABASE_SENHA=sua-senha-do-workspace
```

- [ ] **Step 4: Instalar dependências**

Run: `cd automacao && npm install`
Expected: `node_modules/` criado sem erros.

Playwright usará o Chrome já instalado na máquina (channel `chrome`) — não precisa `npx playwright install`.

- [ ] **Step 5: Commit**

```bash
git add automacao/package.json automacao/package-lock.json automacao/.gitignore automacao/.env.example
git commit -m "feat(automacao): scaffold do projeto de consulta de recursos"
```

---

### Task 2: `mapeamento.js` — lógica pura (TDD)

Regras do spec: Indeferido/Não conhecido → `Indeferido` (+ data limite em `vencimento`); Deferido → `Deferido` (+ `encerrado` se regra do app); Cadastrado sem decisão / Efeito Suspensivo → `Aguardando`; não encontrado → só `ultima_att`. Datas do site vêm em `dd/mm/aaaa`, workspace usa `aaaa-mm-dd`.

**Files:**
- Create: `automacao/mapeamento.js`
- Test: `automacao/test/mapeamento.test.js`

- [ ] **Step 1: Escrever testes que falham**

Criar `automacao/test/mapeamento.test.js`:

```js
const { test } = require('node:test')
const assert = require('node:assert')
const M = require('../mapeamento.js')

test('mapResultado cobre os 5 resultados do site', () => {
  assert.deepStrictEqual(M.mapResultado('Indeferido'), { status: 'Indeferido', precisaDataLimite: true })
  assert.deepStrictEqual(M.mapResultado('Não conhecido'), { status: 'Indeferido', precisaDataLimite: true })
  assert.deepStrictEqual(M.mapResultado('Deferido'), { status: 'Deferido', precisaDataLimite: false })
  assert.deepStrictEqual(M.mapResultado('Cadastrado sem decisão'), { status: 'Aguardando', precisaDataLimite: false })
  assert.deepStrictEqual(M.mapResultado('Efeito Suspensivo'), { status: 'Aguardando', precisaDataLimite: false })
})

test('mapResultado tolera caixa e espaços', () => {
  assert.strictEqual(M.mapResultado('  INDEFERIDO ').status, 'Indeferido')
  assert.strictEqual(M.mapResultado('efeito suspensivo').status, 'Aguardando')
})

test('mapResultado retorna null para texto desconhecido', () => {
  assert.strictEqual(M.mapResultado('Em análise pelo órgão'), null)
  assert.strictEqual(M.mapResultado(''), null)
  assert.strictEqual(M.mapResultado(null), null)
})

test('parseDataBR converte dd/mm/aaaa para aaaa-mm-dd', () => {
  assert.strictEqual(M.parseDataBR('19/08/2026'), '2026-08-19')
  assert.strictEqual(M.parseDataBR('5/3/2026'), '2026-03-05')
  assert.strictEqual(M.parseDataBR('data inválida'), null)
  assert.strictEqual(M.parseDataBR(null), null)
})

test('montarUpdate: indeferido na JARI grava jari, vencimento e ultima_att', () => {
  const ait = { codigo: 'N004330074', defesa_previa: 'Indeferido', jari: 'Aguardando', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'jari', resultado: 'Indeferido', dataLimite: '2026-08-19' }])
  assert.strictEqual(up.jari, 'Indeferido')
  assert.strictEqual(up.vencimento, '2026-08-19')
  assert.strictEqual(up.ultima_att, M.hoje())
  assert.strictEqual(up.encerrado, undefined)
})

test('montarUpdate: deferido encerra a AIT', () => {
  const ait = { codigo: 'X', defesa_previa: 'Indeferido', jari: 'Aguardando', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'jari', resultado: 'Deferido', dataLimite: null }])
  assert.strictEqual(up.jari, 'Deferido')
  assert.strictEqual(up.encerrado, true)
})

test('montarUpdate: indeferido na 2a instancia encerra (fim da linha)', () => {
  const ait = { codigo: 'X', defesa_previa: 'Indeferido', jari: 'Indeferido', segunda_instancia: 'Aguardando', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'segunda_instancia', resultado: 'Indeferido', dataLimite: null }])
  assert.strictEqual(up.segunda_instancia, 'Indeferido')
  assert.strictEqual(up.encerrado, true)
})

test('montarUpdate: site prevalece sobre workspace desatualizado', () => {
  // workspace acha que está em defesa prévia; site mostra decisão na defesa E jari cadastrado
  const ait = { codigo: 'X', defesa_previa: 'Aguardando', jari: '', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [
    { instancia: 'defesa_previa', resultado: 'Indeferido', dataLimite: null },
    { instancia: 'jari', resultado: 'Cadastrado sem decisão', dataLimite: null }
  ])
  assert.strictEqual(up.defesa_previa, 'Indeferido')
  assert.strictEqual(up.jari, 'Aguardando')
})

test('montarUpdate: nada encontrado no site → só ultima_att', () => {
  const ait = { codigo: 'X', defesa_previa: 'Aguardando', jari: '', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [])
  assert.deepStrictEqual(Object.keys(up), ['ultima_att'])
})

test('montarUpdate: resultado desconhecido no site é ignorado (vira só ultima_att)', () => {
  const ait = { codigo: 'X', defesa_previa: 'Aguardando', jari: '', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'defesa_previa', resultado: 'Texto novo do site', dataLimite: null }])
  assert.deepStrictEqual(Object.keys(up), ['ultima_att'])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd automacao && npm test`
Expected: FAIL — `Cannot find module '../mapeamento.js'`

- [ ] **Step 3: Implementar `automacao/mapeamento.js`**

```js
// ─── MAPEAMENTO ───────────────────────────────────────────────
// Regras puras: resultado do site Detran → campos da AIT no workspace.
// Sem I/O — tudo testável.

const MAPA_RESULTADO = {
  'indeferido': 'Indeferido',
  'não conhecido': 'Indeferido',
  'nao conhecido': 'Indeferido',
  'deferido': 'Deferido',
  'cadastrado sem decisão': 'Aguardando',
  'cadastrado sem decisao': 'Aguardando',
  'efeito suspensivo': 'Aguardando'
}

function mapResultado(resultadoSite) {
  const chave = (resultadoSite || '').trim().toLowerCase()
  const status = MAPA_RESULTADO[chave]
  if (!status) return null
  return { status, precisaDataLimite: status === 'Indeferido' }
}

function parseDataBR(txt) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((txt || '').trim())
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function hoje() {
  return new Date().toISOString().split('T')[0]
}

// Mesma regra de encerramento do app (data.js: deveEncerrar)
function deveEncerrar(a) {
  return a.defesa_previa === 'Deferido' ||
         a.jari === 'Deferido' ||
         a.segunda_instancia === 'Deferido' ||
         a.segunda_instancia === 'Indeferido'
}

// achados: [{ instancia: 'defesa_previa'|'jari'|'segunda_instancia',
//             resultado: string, dataLimite: 'aaaa-mm-dd'|null }]
// Retorna objeto de campos a gravar na AIT. Sempre inclui ultima_att.
function montarUpdate(ait, achados) {
  const fields = {}
  for (const a of achados) {
    const m = mapResultado(a.resultado)
    if (!m) continue
    fields[a.instancia] = m.status
    if (m.precisaDataLimite && a.dataLimite) fields.vencimento = a.dataLimite
  }
  const merged = { ...ait, ...fields }
  if (!ait.encerrado && deveEncerrar(merged)) fields.encerrado = true
  fields.ultima_att = hoje()
  return fields
}

module.exports = { mapResultado, parseDataBR, hoje, deveEncerrar, montarUpdate }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd automacao && npm test`
Expected: PASS — todos os testes verdes.

- [ ] **Step 5: Commit**

```bash
git add automacao/mapeamento.js automacao/test/mapeamento.test.js
git commit -m "feat(automacao): regras de mapeamento resultado Detran -> workspace (TDD)"
```

---

### Task 3: `supabase.js` — leitura e gravação

**Files:**
- Create: `automacao/supabase.js`

- [ ] **Step 1: Implementar `automacao/supabase.js`**

```js
// ─── SUPABASE ────────────────────────────────────────────────
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

let client = null

async function login() {
  for (const v of ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_EMAIL', 'SUPABASE_SENHA']) {
    if (!process.env[v]) throw new Error(`Variável ${v} ausente no .env`)
  }
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  const { error } = await client.auth.signInWithPassword({
    email: process.env.SUPABASE_EMAIL,
    password: process.env.SUPABASE_SENHA
  })
  if (error) throw new Error(`Login Supabase falhou: ${error.message}`)
}

// AITs ativas (encerrado false OU null — app filtra !a.encerrado) + placas + clientes
async function carregarAtivas() {
  const [aits, placas, clientes] = await Promise.all([
    client.from('aits').select('*').or('encerrado.is.null,encerrado.eq.false'),
    client.from('placas').select('*'),
    client.from('clientes').select('*')
  ])
  for (const r of [aits, placas, clientes]) if (r.error) throw r.error
  return { aits: aits.data, placas: placas.data, clientes: clientes.data }
}

async function updateAIT(id, fields) {
  const { error } = await client.from('aits').update(fields).eq('id', id)
  if (error) throw new Error(`Update AIT ${id} falhou: ${error.message}`)
}

module.exports = { login, carregarAtivas, updateAIT }
```

- [ ] **Step 2: Criar `.env` local a partir do exemplo**

O usuário (Eduardo) preenche `automacao/.env` com email/senha reais do workspace. Não commitar.

- [ ] **Step 3: Smoke test de leitura (sem gravar nada)**

Run:
```bash
cd automacao && node -e "const s=require('./supabase.js');(async()=>{await s.login();const d=await s.carregarAtivas();console.log('aits ativas:',d.aits.length,'placas:',d.placas.length,'clientes:',d.clientes.length)})()"
```
Expected: contagens > 0, sem erro. Se login falhar, conferir `.env` com o usuário antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add automacao/supabase.js
git commit -m "feat(automacao): acesso Supabase (login, carga de ativas, update de AIT)"
```

---

### Task 4: `captura.js` — Etapa 0, fixtures do site real ⚠️ CHECKPOINT COM USUÁRIO

Pré-requisito do parser (Task 5). Também é o teste de fogo do risco "site hostil a automação": se o Detran bloquear o Chrome automatizado já aqui, parar e reavaliar com o usuário.

**Files:**
- Create: `automacao/captura.js`

- [ ] **Step 1: Implementar `automacao/captura.js`**

```js
// ─── CAPTURA (Etapa 0) ───────────────────────────────────────
// Salva HTML renderizado do dossiê em fixtures/ para desenvolver o parser.
// Uso: node captura.js PLACA1:RENAVAM1 [PLACA2:RENAVAM2 ...]
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const BASE = 'https://servicos.detran.sc.gov.br/consulta-dossie-veiculo'
const PROFILE = path.join(__dirname, 'chrome-profile')
const FIXTURES = path.join(__dirname, 'fixtures')

function perguntar(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(msg, ans => { rl.close(); res(ans) }))
}

async function main() {
  const alvos = process.argv.slice(2).map(s => {
    const [placa, renavam] = s.split(':')
    if (!placa || !renavam) throw new Error(`Argumento inválido: "${s}" — use PLACA:RENAVAM`)
    return { placa, renavam }
  })
  if (!alvos.length) {
    console.log('Uso: node captura.js PLACA1:RENAVAM1 [PLACA2:RENAVAM2 ...]')
    process.exit(1)
  }

  fs.mkdirSync(FIXTURES, { recursive: true })
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    viewport: null
  })
  const page = ctx.pages()[0] || await ctx.newPage()

  for (const { placa, renavam } of alvos) {
    console.log(`\n→ Abrindo dossiê de ${placa}...`)
    await page.goto(`${BASE}?placa=${placa}&renavam=${renavam}`, { waitUntil: 'domcontentloaded' })
    await perguntar(
      'Faça login se pedido. Depois navegue até "Recursos de infrações", clique em cada aba,\n' +
      'e por fim abra a aba "Débitos". Quando TUDO tiver carregado, pressione Enter... '
    )
    const html = await page.content()
    const arq = path.join(FIXTURES, `dossie-${placa}.html`)
    fs.writeFileSync(arq, html)
    await page.screenshot({ path: path.join(FIXTURES, `dossie-${placa}.png`), fullPage: true })
    console.log(`  salvo: ${arq}`)
  }

  console.log('\nSe alguma placa der ERRO DE PERMISSÃO, rode de novo com ela para capturar a tela de erro.')
  await ctx.close()
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Commit do script**

```bash
git add automacao/captura.js
git commit -m "feat(automacao): script de captura de fixtures do dossie (Etapa 0)"
```

- [ ] **Step 3: ⚠️ CHECKPOINT — usuário executa a captura**

Pedir ao usuário para rodar, com 2–3 placas reais variadas (ideal: uma com recurso indeferido, uma com recurso aguardando, uma SEM permissão de acesso):

```bash
cd automacao && node captura.js MJL0H67:489968520 OUTRA:RENAVAM SEMPERMISSAO:RENAVAM
```

Perguntas a responder com o resultado (bloqueiam a Task 5):
1. O site carregou normalmente no Chrome automatizado, ou bloqueou/captcha?
2. As abas de "Recursos de infrações" correspondem às instâncias (Defesa Prévia / JARI / 2ª Instância)? Quais os títulos exatos?
3. Qual o texto exato dos 5 resultados possíveis no card?
4. Na aba "Débitos", como aparece o código AIT e a data?
5. Qual a mensagem exata do erro de permissão?

- [ ] **Step 4: Commit das fixtures**

```bash
git add automacao/fixtures/
git commit -m "test(automacao): fixtures de HTML real do dossie Detran"
```

---

### Task 5: `detran.js` — parser (TDD contra fixtures)

⚠️ **Os seletores abaixo são provisórios** — foram escritos antes da Etapa 0. Primeiro passo desta task é inspecionar as fixtures e ajustar os seletores/regex à estrutura real. A estrutura das funções e dos testes permanece.

**Files:**
- Create: `automacao/detran.js` (parte parser)
- Test: `automacao/test/detran-parser.test.js`

- [ ] **Step 1: Inspecionar fixtures e mapear a estrutura real**

Abrir `automacao/fixtures/dossie-*.html`, localizar: container da seção "Recursos de infrações", elemento das abas, elemento do código AIT dentro do card, elemento do resultado, tabela/lista da aba "Débitos", mensagem de erro de permissão. Anotar seletores reais.

- [ ] **Step 2: Escrever testes contra as fixtures (falham)**

Criar `automacao/test/detran-parser.test.js` — ajustar códigos/valores esperados ao conteúdo real das fixtures:

```js
const { test, before, after } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')
const D = require('../detran.js')

let browser, page

before(async () => {
  browser = await chromium.launch()
  page = await browser.newPage()
})
after(async () => { await browser.close() })

async function carregarFixture(nome) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'fixtures', nome), 'utf8')
  await page.setContent(html)
}

test('extractRecursos acha código, instância e resultado', async () => {
  await carregarFixture('dossie-MJL0H67.html')          // ajustar ao arquivo real
  const recursos = await D.extractRecursos(page)
  assert.ok(recursos.length >= 1)
  const r = recursos.find(x => x.codigo === 'N004330074') // ajustar ao código real
  assert.ok(r, 'código da fixture deve ser encontrado')
  assert.ok(['defesa_previa', 'jari', 'segunda_instancia'].includes(r.instancia))
  assert.ok(typeof r.resultado === 'string' && r.resultado.length > 0)
})

test('extractDebitos acha código e data', async () => {
  await carregarFixture('dossie-MJL0H67.html')          // ajustar
  const debitos = await D.extractDebitos(page)
  const d = debitos.find(x => x.codigo === 'N004330074') // ajustar
  assert.ok(d)
  assert.match(d.data, /^\d{4}-\d{2}-\d{2}$/)
})

test('isPermissaoNegada detecta erro de permissão', async () => {
  await carregarFixture('dossie-SEMPERMISSAO.html')     // ajustar
  assert.strictEqual(await D.isPermissaoNegada(page), true)
})

test('isPermissaoNegada é falso em dossiê normal', async () => {
  await carregarFixture('dossie-MJL0H67.html')          // ajustar
  assert.strictEqual(await D.isPermissaoNegada(page), false)
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd automacao && npm test`
Expected: FAIL — `Cannot find module '../detran.js'`

- [ ] **Step 4: Implementar parser em `automacao/detran.js`**

Esqueleto (seletores `AJUSTAR` conforme Step 1):

```js
// ─── DETRAN ──────────────────────────────────────────────────
// Extração de dados do dossiê do veículo. Seletores calibrados
// pelas fixtures capturadas na Etapa 0 (captura.js).
const M = require('./mapeamento.js')

// AJUSTAR após inspecionar fixtures:
const SEL = {
  erroPermissao: 'text=/não possui permissão|não autorizado/i',
  secaoRecursos: 'AJUSTAR',   // container "Recursos de infrações"
  abasRecurso: 'AJUSTAR',     // cada aba de instância
  cardRecurso: 'AJUSTAR',     // card de um recurso dentro da aba
  codigoNoCard: 'AJUSTAR',
  resultadoNoCard: 'AJUSTAR',
  linhaDebito: 'AJUSTAR',     // linha da aba Débitos
  codigoNoDebito: 'AJUSTAR',
  dataNoDebito: 'AJUSTAR'
}

// Título da aba → campo da AIT. AJUSTAR aos títulos reais.
const INSTANCIA_POR_ABA = [
  { re: /defesa/i, campo: 'defesa_previa' },
  { re: /jari|1ª inst/i, campo: 'jari' },
  { re: /cetran|2ª inst|segunda/i, campo: 'segunda_instancia' }
]

function instanciaDaAba(titulo) {
  const hit = INSTANCIA_POR_ABA.find(x => x.re.test(titulo))
  return hit ? hit.campo : null
}

// → [{ codigo, instancia, resultado }]
async function extractRecursos(page) {
  const out = []
  const abas = page.locator(SEL.abasRecurso)
  const n = await abas.count()
  for (let i = 0; i < n; i++) {
    const aba = abas.nth(i)
    const titulo = (await aba.innerText()).trim()
    const instancia = instanciaDaAba(titulo)
    if (!instancia) continue
    await aba.click()
    const cards = page.locator(SEL.cardRecurso)
    const nc = await cards.count()
    for (let j = 0; j < nc; j++) {
      const card = cards.nth(j)
      const codigo = (await card.locator(SEL.codigoNoCard).innerText()).trim()
      const resultado = (await card.locator(SEL.resultadoNoCard).innerText()).trim()
      out.push({ codigo, instancia, resultado })
    }
  }
  return out
}

// → [{ codigo, data: 'aaaa-mm-dd' }]
async function extractDebitos(page) {
  const out = []
  const linhas = page.locator(SEL.linhaDebito)
  const n = await linhas.count()
  for (let i = 0; i < n; i++) {
    const l = linhas.nth(i)
    const codigo = (await l.locator(SEL.codigoNoDebito).innerText()).trim()
    const dataTxt = (await l.locator(SEL.dataNoDebito).innerText()).trim()
    const data = M.parseDataBR(dataTxt)
    if (codigo && data) out.push({ codigo, data })
  }
  return out
}

async function isPermissaoNegada(page) {
  return (await page.locator(SEL.erroPermissao).count()) > 0
}

module.exports = { extractRecursos, extractDebitos, isPermissaoNegada, instanciaDaAba, SEL }
```

Nota: se as fixtures mostrarem que clicar em abas não funciona com `setContent` (conteúdo carregado via rede), adaptar: capturar uma fixture POR ABA na Etapa 0 (captura salva um HTML após cada clique) e o parser extrai da aba ativa; testes carregam cada fixture separadamente.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd automacao && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add automacao/detran.js automacao/test/detran-parser.test.js
git commit -m "feat(automacao): parser do dossie Detran calibrado por fixtures (TDD)"
```

---

### Task 6: `detran.js` — navegação

**Files:**
- Modify: `automacao/detran.js` (adicionar navegação no mesmo módulo)

- [ ] **Step 1: Adicionar navegação a `automacao/detran.js`**

Acrescentar ao módulo (e exportar):

```js
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const BASE = 'https://servicos.detran.sc.gov.br/consulta-dossie-veiculo'
const PROFILE = path.join(__dirname, 'chrome-profile')
const LOGS = path.join(__dirname, 'logs')

async function abrirBrowser() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    viewport: null
  })
  return { ctx, page: ctx.pages()[0] || await ctx.newPage() }
}

// Detecta tela de login e espera o usuário logar (polling, sem timeout curto).
// AJUSTAR o seletor de tela de login conforme observado na Etapa 0.
async function garantirLogado(page) {
  const emLogin = () => /login|sso|acesso/i.test(page.url())
  if (!emLogin()) return
  console.log('\n*** Faça login no Detran Digital na janela do Chrome. A automação continua sozinha. ***')
  while (emLogin()) await page.waitForTimeout(2000)
  await page.waitForLoadState('networkidle')
}

// Abre o dossiê e espera a seção de recursos (ou erro de permissão) aparecer.
async function abrirDossie(page, placa, renavam) {
  await page.goto(`${BASE}?placa=${placa}&renavam=${renavam}`, { waitUntil: 'domcontentloaded' })
  await garantirLogado(page)
  await page.waitForSelector(`${SEL.secaoRecursos}, ${SEL.erroPermissao}`, { timeout: 30000 })
}

async function screenshotErro(page, placa) {
  fs.mkdirSync(LOGS, { recursive: true })
  const arq = path.join(LOGS, `erro-${placa}-${Date.now()}.png`)
  try { await page.screenshot({ path: arq, fullPage: true }) } catch {}
  return arq
}

// exportar também: abrirBrowser, garantirLogado, abrirDossie, screenshotErro
```

- [ ] **Step 2: Smoke test manual com 1 placa real**

Run:
```bash
cd automacao && node -e "const D=require('./detran.js');(async()=>{const {ctx,page}=await D.abrirBrowser();await D.abrirDossie(page,'MJL0H67','489968520');console.log('recursos:',await D.extractRecursos(page));console.log('debitos:',await D.extractDebitos(page));await ctx.close()})()"
```
Expected: imprime recursos e débitos coerentes com o que o usuário vê manualmente. Validar com o usuário.

- [ ] **Step 3: Commit**

```bash
git add automacao/detran.js
git commit -m "feat(automacao): navegacao do dossie com login assistido e retry"
```

---

### Task 7: `relatorio.js`

**Files:**
- Create: `automacao/relatorio.js`

- [ ] **Step 1: Implementar `automacao/relatorio.js`**

```js
// ─── RELATÓRIO ───────────────────────────────────────────────
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// itens: [{ cliente, placa, codigo, tipo, antes, depois, vencimento, detalhe }]
// tipo: 'atualizado' | 'sem-mudanca' | 'nao-encontrado' | 'sem-permissao' | 'erro'
function gerar(itens, dryRun) {
  const cor = { atualizado: '#16a34a', 'sem-mudanca': '#64748b', 'nao-encontrado': '#d97706', 'sem-permissao': '#dc2626', erro: '#dc2626' }
  const resumo = {}
  for (const i of itens) resumo[i.tipo] = (resumo[i.tipo] || 0) + 1

  const linhas = itens.map(i => `<tr>
    <td>${i.cliente || '—'}</td><td>${i.placa || '—'}</td><td>${i.codigo || '—'}</td>
    <td style="color:${cor[i.tipo]};font-weight:600">${i.tipo}</td>
    <td>${i.antes || '—'}</td><td>${i.depois || '—'}</td>
    <td>${i.vencimento || '—'}</td><td>${i.detalhe || ''}</td></tr>`).join('')

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Consulta de Recursos — ${new Date().toLocaleString('pt-BR')}</title>
<style>body{font-family:system-ui;margin:24px;background:#0f172a;color:#e2e8f0}
table{border-collapse:collapse;width:100%;font-size:13px}
td,th{border:1px solid #334155;padding:6px 10px;text-align:left}
th{background:#1e293b}.aviso{background:#7c2d12;padding:10px;border-radius:8px;margin-bottom:16px}</style></head><body>
<h1>Consulta de Recursos — ${new Date().toLocaleString('pt-BR')}</h1>
${dryRun ? '<div class="aviso"><b>DRY-RUN:</b> nada foi gravado no workspace.</div>' : ''}
<p>${Object.entries(resumo).map(([k, v]) => `<b>${v}</b> ${k}`).join(' · ')}</p>
<table><tr><th>Cliente</th><th>Placa</th><th>AIT</th><th>Resultado</th><th>Antes</th><th>Depois</th><th>Vencimento</th><th>Detalhe</th></tr>
${linhas}</table></body></html>`

  const dir = path.join(__dirname, 'logs')
  fs.mkdirSync(dir, { recursive: true })
  const arq = path.join(dir, `relatorio-${new Date().toISOString().replace(/[:.]/g, '-')}.html`)
  fs.writeFileSync(arq, html)
  return arq
}

function abrir(arq) {
  try { execSync(`start "" "${arq}"`, { shell: 'cmd.exe' }) } catch {}
}

module.exports = { gerar, abrir }
```

- [ ] **Step 2: Smoke test**

Run:
```bash
cd automacao && node -e "const R=require('./relatorio.js');R.abrir(R.gerar([{cliente:'Teste',placa:'ABC1D23',codigo:'N1',tipo:'atualizado',antes:'Aguardando',depois:'Indeferido',vencimento:'2026-08-19'}],true))"
```
Expected: relatório abre no browser com 1 linha e aviso de dry-run.

- [ ] **Step 3: Commit**

```bash
git add automacao/relatorio.js
git commit -m "feat(automacao): relatorio HTML da execucao"
```

---

### Task 8: `index.js` — orquestrador

**Files:**
- Create: `automacao/index.js`

- [ ] **Step 1: Implementar `automacao/index.js`**

```js
// ─── CONSULTA DE RECURSOS ────────────────────────────────────
// Uso: node index.js [--dry-run]
const S = require('./supabase.js')
const D = require('./detran.js')
const M = require('./mapeamento.js')
const R = require('./relatorio.js')

const DRY = process.argv.includes('--dry-run')
const PAUSA_ENTRE_PLACAS_MS = 3000

const STATUS_LABEL = a =>
  `DP:${a.defesa_previa || '—'} | JARI:${a.jari || '—'} | 2ª:${a.segunda_instancia || '—'}`

async function processarPlaca(page, placa, aits, itens, clientes) {
  const cliente = clientes.find(c => c.id === placa.cliente_id)
  const nomeCliente = cliente ? cliente.nome : '—'

  await D.abrirDossie(page, placa.placa, placa.renavan)

  if (await D.isPermissaoNegada(page)) {
    for (const a of aits) itens.push({ cliente: nomeCliente, placa: placa.placa, codigo: a.codigo, tipo: 'sem-permissao', detalhe: 'Cliente ainda não autorizou acesso' })
    return
  }

  const recursos = await D.extractRecursos(page)
  const precisaDebitos = recursos.some(r => {
    const m = M.mapResultado(r.resultado)
    return m && m.precisaDataLimite
  })
  const debitos = precisaDebitos ? await D.extractDebitos(page) : []

  for (const ait of aits) {
    const achados = recursos
      .filter(r => r.codigo === ait.codigo)
      .map(r => ({
        instancia: r.instancia,
        resultado: r.resultado,
        dataLimite: (debitos.find(d => d.codigo === ait.codigo) || {}).data || null
      }))
    const up = M.montarUpdate(ait, achados)
    const antes = STATUS_LABEL(ait)
    const soUltimaAtt = Object.keys(up).length === 1

    if (!DRY) await S.updateAIT(ait.id, up)

    itens.push({
      cliente: nomeCliente, placa: placa.placa, codigo: ait.codigo,
      tipo: achados.length === 0 ? 'nao-encontrado' : (soUltimaAtt ? 'sem-mudanca' : 'atualizado'),
      antes, depois: STATUS_LABEL({ ...ait, ...up }),
      vencimento: up.vencimento || '',
      detalhe: up.encerrado ? 'AIT encerrada' : ''
    })
  }
}

async function main() {
  console.log(DRY ? '== DRY-RUN: nada será gravado ==' : '== Execução real ==')
  await S.login()
  const { aits, placas, clientes } = await S.carregarAtivas()
  console.log(`${aits.length} AITs ativas em ${new Set(aits.map(a => a.placa_id)).size} placas`)

  const porPlaca = new Map()
  for (const a of aits) {
    if (!porPlaca.has(a.placa_id)) porPlaca.set(a.placa_id, [])
    porPlaca.get(a.placa_id).push(a)
  }

  const { ctx, page } = await D.abrirBrowser()
  const itens = []
  let n = 0

  for (const [placaId, aitsDaPlaca] of porPlaca) {
    const placa = placas.find(p => p.id === placaId)
    n++
    if (!placa) {
      for (const a of aitsDaPlaca) itens.push({ codigo: a.codigo, tipo: 'erro', detalhe: 'placa não encontrada no cadastro' })
      continue
    }
    console.log(`[${n}/${porPlaca.size}] ${placa.placa}...`)
    let tentativa = 0
    while (true) {
      try {
        await processarPlaca(page, placa, aitsDaPlaca, itens, clientes)
        break
      } catch (e) {
        tentativa++
        if (tentativa > 1) {
          const shot = await D.screenshotErro(page, placa.placa)
          for (const a of aitsDaPlaca) itens.push({ placa: placa.placa, codigo: a.codigo, tipo: 'erro', detalhe: `${e.message} (screenshot: ${shot})` })
          break
        }
        console.log(`  falhou (${e.message}), tentando de novo...`)
      }
    }
    await page.waitForTimeout(PAUSA_ENTRE_PLACAS_MS)
  }

  await ctx.close()
  const arq = R.gerar(itens, DRY)
  R.abrir(arq)
  console.log(`\nRelatório: ${arq}`)
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Rodar testes (garantir nada quebrou)**

Run: `cd automacao && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add automacao/index.js
git commit -m "feat(automacao): orquestrador com dry-run, retry e relatorio"
```

---

### Task 9: Lançador e atalho no desktop

**Files:**
- Create: `automacao/Consultar Recursos.bat`

- [ ] **Step 1: Criar `automacao/Consultar Recursos.bat`**

```bat
@echo off
title Consulta de Recursos - Zero Pontos
cd /d "C:\Users\eduar\dev\zero-pontos\automacao"
node index.js %*
echo.
pause
```

- [ ] **Step 2: Criar atalho no desktop**

Run (PowerShell):
```powershell
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut("$env:USERPROFILE\Desktop\Consultar Recursos.lnk")
$s.TargetPath = "C:\Users\eduar\dev\zero-pontos\automacao\Consultar Recursos.bat"
$s.WorkingDirectory = "C:\Users\eduar\dev\zero-pontos\automacao"
$s.Save()
```
Expected: atalho "Consultar Recursos" no desktop.

- [ ] **Step 3: Commit**

```bash
git add "automacao/Consultar Recursos.bat"
git commit -m "feat(automacao): lancador .bat para atalho no desktop"
```

---

### Task 10: Validação com usuário (dry-run → real)

- [ ] **Step 1: Dry-run completo**

Usuário roda: `cd automacao && npm run dry-run`
Relatório abre. Usuário confere 5+ cards contra o site manualmente (misto de indeferido/deferido/aguardando/sem permissão).

- [ ] **Step 2: Corrigir divergências**

Cada divergência vira ajuste em seletor/regra + teste novo em `test/`. Repetir dry-run até bater.

- [ ] **Step 3: Primeira execução real supervisionada**

Usuário roda: `npm run consultar` (sem `--dry-run`). Conferir no workspace que os cards atualizaram e saíram da fila de verificação.

- [ ] **Step 4: Commit final + push**

```bash
git add -A automacao docs/superpowers/plans
git commit -m "feat(automacao): consulta de recursos validada em producao"
git push
```
