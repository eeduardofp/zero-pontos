# Fase 4 — Migração do Legado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Casar as pastas de caso do share `\\100.110.210.37\Zero Pontos` com as AITs/suspensões/clientes do Supabase e subir os arquivos (PDF + Word + imagens + planilhas) para o cofre R2, anexados ao registro certo — com dry-run revisável em CSV antes de qualquer upload.

**Architecture:** Pipeline em três estágios: (1) **dry-run** varre o share em SOMENTE LEITURA, aplica parsing dos caminhos e matching contra o banco, e grava `plano-migracao.csv`; (2) **revisão humana** do CSV (Excel); (3) **upload** lê o CSV aprovado, loga no Supabase com as credenciais do `.env` da automacao, faz PUT no worker zp-docs com o JWT e insere as linhas na tabela `documentos`. Retomável: antes de subir, consulta `documentos` por (dono, nome, tamanho) e pula o que já existe.

**Tech Stack:** Node (CommonJS, padrão da `automacao/`), `node:test` para as funções puras, reuso de `mapeamento.js` (`mesmoCodigo`, `normalizar`) e `supabase.js` (login). Fetch nativo do Node ≥18.

**Restrições:**
- Share é SOMENTE LEITURA — proibido alterar/mover/renomear/excluir qualquer coisa lá.
- Nenhum upload sem CSV revisado pelo usuário (`--upload` exige caminho do CSV explícito).
- Tipos incluídos (pedido explícito): `.pdf .doc .docx .jpg .jpeg .png .xls .xlsx`. Excluídos: `Thumbs.db, desktop.ini, .lnk, .tmp, .db, .zip, .url` e afins.
- Limite do worker: 25 MB — arquivos maiores entram no CSV marcados `pular_grande`.

**Files:**
- Create: `automacao/migracao/matching.js` (funções puras)
- Create: `automacao/migracao/inventario.js` (varredura + aplicação do matching)
- Create: `automacao/migracao/migrar.js` (CLI dry-run/upload)
- Create: `automacao/test/migracao.test.js`
- Modify: `automacao/supabase.js` (exportar `getClient` e `buscarTudo`; loader de dados completos p/ migração)

---

### Task 1: Funções puras de matching (TDD)

**Files:**
- Create: `automacao/migracao/matching.js`
- Test: `automacao/test/migracao.test.js`

- [ ] **Step 1: Escrever os testes**

```js
// automacao/test/migracao.test.js
const test = require('node:test')
const assert = require('node:assert')
const M = require('../migracao/matching')

test('parseCaminho identifica níveis da árvore de defesas', () => {
  const p = M.parseCaminho('1. NOVO MODELO DEFESAS ADMINISTRATIVAS\\Defesas 2025\\ADAILTON MARQUES SANTOS\\160. Cetran. JARI. Defesa JL01338914\\Recurso JARI.doc')
  assert.equal(p.categoria, 'defesa')
  assert.equal(p.ano, 2025)
  assert.equal(p.cliente, 'ADAILTON MARQUES SANTOS')
  assert.equal(p.caso, '160. Cetran. JARI. Defesa JL01338914')
  assert.equal(p.arquivo, 'Recurso JARI.doc')
})

test('parseCaminho: arquivo no nível do cliente tem caso null', () => {
  const p = M.parseCaminho('1. NOVO MODELO DEFESAS ADMINISTRATIVAS\\Defesas 2025\\ADAILTON MARQUES SANTOS\\CNH.pdf')
  assert.equal(p.caso, null)
  assert.equal(p.arquivo, 'CNH.pdf')
})

test('parseCaminho: suspensão vira categoria suspensao', () => {
  const p = M.parseCaminho('1. NOVO MODELO DEFESAS ADMINISTRATIVAS\\Suspensão CNH 2023\\12. MOACIR ROECKER\\Defesa.doc')
  assert.equal(p.categoria, 'suspensao')
  assert.equal(p.cliente, 'MOACIR ROECKER')
})

test('parseCaminho: recusa bafômetro é categoria defesa', () => {
  const p = M.parseCaminho('1. NOVO MODELO DEFESAS ADMINISTRATIVAS\\Recusa Bafometro 2024\\9. LARISSA BECKER DEMATTE\\NA.pdf')
  assert.equal(p.categoria, 'defesa')
  assert.equal(p.cliente, 'LARISSA BECKER DEMATTE')
})

test('parseCaminho: fora da árvore de defesas retorna null', () => {
  assert.equal(M.parseCaminho('ZERO PONTOS\\Modelo de Documentos\\x.pdf'), null)
})

test('limparNomeCliente remove numeração e qualificadores após ponto', () => {
  assert.equal(M.limparNomeCliente('12. MOACIR ROECKER'), 'MOACIR ROECKER')
  assert.equal(M.limparNomeCliente('DANIEL OSMAR ADELINO. Balantec'), 'DANIEL OSMAR ADELINO')
  assert.equal(M.limparNomeCliente('ANTÔNIO ROMEU LOPES'), 'ANTONIO ROMEU LOPES')
})

test('incluirArquivo aceita pdf/word/imagem/planilha e recusa lixo', () => {
  assert.ok(M.incluirArquivo('Defesa.doc'))
  assert.ok(M.incluirArquivo('CNH.jpeg'))
  assert.ok(M.incluirArquivo('AIT.PDF'))
  assert.ok(M.incluirArquivo('controle.xlsx'))
  assert.ok(!M.incluirArquivo('Thumbs.db'))
  assert.ok(!M.incluirArquivo('atalho.lnk'))
  assert.ok(!M.incluirArquivo('backup.zip'))
})

test('tipoDocumento classifica pelo nome', () => {
  assert.equal(M.tipoDocumento('NA.pdf'), 'NA')
  assert.equal(M.tipoDocumento('NP.jpeg'), 'NP')
  assert.equal(M.tipoDocumento('AIT.pdf'), 'AIT')
  assert.equal(M.tipoDocumento('Defesa Prévia.PDF.pdf'), 'Defesa')
  assert.equal(M.tipoDocumento('Recurso JARI.doc'), 'Defesa')
  assert.equal(M.tipoDocumento('Parecer indeferimento.pdf'), 'Parecer')
  assert.equal(M.tipoDocumento('Protocolo e Senha.jpeg'), 'Comprovante')
  assert.equal(M.tipoDocumento('Comprovante_884.pdf'), 'Comprovante')
  assert.equal(M.tipoDocumento('CNH.pdf'), 'CNH')
  assert.equal(M.tipoDocumento('CRLv 1.pdf'), 'CRLV')
  assert.equal(M.tipoDocumento('Procuração assinada.pdf'), 'Procuracao')
  assert.equal(M.tipoDocumento('foto local.png'), 'Outro')
})

test('casarClientePorNome: exato > prefixo > null', () => {
  const clientes = [
    { id: 'c1', nome: 'ADAILTON MARQUES SANTOS' },
    { id: 'c2', nome: 'MOACIR ROECKER' },
    { id: 'c3', nome: 'MARCIO FELIPE CUSTODIO' },
  ]
  assert.equal(M.casarClientePorNome('ADAILTON MARQUES SANTOS', clientes).id, 'c1')
  assert.equal(M.casarClientePorNome('12. MOACIR ROECKER', clientes).id, 'c2')
  assert.equal(M.casarClientePorNome('MARCIO FELIPE CUSTODIO. Placas RYT', clientes).id, 'c3')
  assert.equal(M.casarClientePorNome('FULANO INEXISTENTE', clientes), null)
})

test('casarAIT: código no nome do caso casa com a AIT do cliente', () => {
  const clientes = [{ id: 'c1', nome: 'ADAILTON MARQUES SANTOS' }]
  const placas = [{ id: 'p1', cliente_id: 'c1' }]
  const aits = [
    { id: 'a1', codigo: 'JL01338914', placa_id: 'p1' },
    { id: 'a2', codigo: 'JV00159575', placa_id: 'p1' },
  ]
  const r = M.casarAIT('160. Cetran. JARI. Defesa JL01338914', 'c1', { aits, placas, clientes })
  assert.equal(r.ait.id, 'a1')
  assert.equal(r.confianca, 'alta')
})

test('casarAIT: sem código que case retorna null', () => {
  const clientes = [{ id: 'c1', nome: 'X' }]
  const placas = [{ id: 'p1', cliente_id: 'c1' }]
  const aits = [{ id: 'a1', codigo: 'JL01338914', placa_id: 'p1' }]
  assert.equal(M.casarAIT('1. Defesa SEMCODIGO999', 'c1', { aits, placas, clientes }), null)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd automacao && node --test test/migracao.test.js`
Expected: FAIL (módulo `migracao/matching` não existe)

- [ ] **Step 3: Implementar matching.js**

```js
// ─── MATCHING (migração do legado) ───────────────────────────
// Funções puras: parsing dos caminhos do share e casamento com o banco.
// Nenhum acesso a disco ou rede aqui — tudo testável isolado.
const { mesmoCodigo } = require('../mapeamento')

const RAIZ_DEFESAS = '1. NOVO MODELO DEFESAS ADMINISTRATIVAS'
const EXTENSOES = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'xls', 'xlsx'])

function semAcento(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Nome da pasta de cliente: "12. MOACIR ROECKER" ou
// "DANIEL OSMAR ADELINO. Balantec" → nome canônico sem numeração/apelido.
function limparNomeCliente(pasta) {
  let s = String(pasta || '').trim()
  s = s.replace(/^\d+\.\s*/, '')            // numeração inicial
  s = s.split('.')[0]                        // qualificador após o primeiro ponto
  return semAcento(s).toUpperCase().replace(/\s+/g, ' ').trim()
}

// Caminho relativo ao share → níveis da árvore de defesas, ou null se
// estiver fora dela (ZERO PONTOS, Computador formatado Paulo, etc.)
function parseCaminho(relPath) {
  const partes = String(relPath || '').split('\\').filter(Boolean)
  if (partes.length < 4 || partes[0] !== RAIZ_DEFESAS) return null
  const cat = partes[1]
  const m = cat.match(/^(Defesas|Suspensão CNH|Recusa Bafometro)\s+(\d{4})$/i)
  if (!m) return null
  const categoria = /suspens/i.test(m[1]) ? 'suspensao' : 'defesa'
  const ano = parseInt(m[2], 10)
  const cliente = limparNomeCliente(partes[2])
  const arquivo = partes[partes.length - 1]
  // partes[3..n-2] são pastas de caso (pode haver subníveis: Documentos/, Dados/)
  const caso = partes.length >= 5 ? partes[3] : null
  return { categoria, ano, cliente, clientePasta: partes[2], caso, arquivo }
}

function incluirArquivo(nome) {
  const n = String(nome || '').toLowerCase()
  if (n === 'thumbs.db' || n === 'desktop.ini') return false
  const ext = n.split('.').pop()
  return EXTENSOES.has(ext)
}

function tipoDocumento(nome) {
  const n = semAcento(String(nome || '')).toLowerCase()
  if (/procurac/.test(n)) return 'Procuracao'
  if (/\bcnh\b/.test(n)) return 'CNH'
  if (/crlv/.test(n)) return 'CRLV'
  if (/protocolo|comprovante|senha/.test(n)) return 'Comprovante'
  if (/parecer|decisao|indeferi|deferi/.test(n)) return 'Parecer'
  if (/defesa|recurso|jari|cetran/.test(n)) return 'Defesa'
  if (/^na[\s._]|^na\.|\bna\.pdf$/.test(n) || /^na\b/.test(n)) return 'NA'
  if (/^np[\s._]|^np\./.test(n)) return 'NP'
  if (/notifica/.test(n)) return 'NA'
  if (/^ait|\bait\b/.test(n)) return 'AIT'
  return 'Outro'
}

// Cliente da pasta → registro no banco. Exato primeiro; depois um-contém-o-outro
// (pastas trazem sobrenomes a mais/menos). Empate → null (revisão manual).
function casarClientePorNome(pasta, clientes) {
  const alvo = limparNomeCliente(pasta)
  if (!alvo) return null
  const norm = c => semAcento(c.nome || '').toUpperCase().replace(/\s+/g, ' ').trim()
  const exatos = clientes.filter(c => norm(c) === alvo)
  if (exatos.length === 1) return exatos[0]
  const parciais = clientes.filter(c => {
    const n = norm(c)
    return n.startsWith(alvo) || alvo.startsWith(n)
  })
  return parciais.length === 1 ? parciais[0] : null
}

// Pasta de caso → AIT. Restringe às AITs do cliente casado (via placas) e
// usa mesmoCodigo (tolerante a truncamento/formatos) contra o nome da pasta.
function casarAIT(nomeCaso, clienteId, dados) {
  const placasCliente = new Set(dados.placas.filter(p => p.cliente_id === clienteId).map(p => p.id))
  const doCliente = dados.aits.filter(a => placasCliente.has(a.placa_id))
  const casadas = doCliente.filter(a => a.codigo && mesmoCodigo(nomeCaso, a.codigo))
  if (casadas.length === 1) return { ait: casadas[0], confianca: 'alta' }
  if (casadas.length > 1) return { ait: casadas[0], confianca: 'ambigua' }
  return null
}

// Cliente → suspensão. A pasta de caso raramente traz o nº do processo;
// quando traz, desempata. Uma suspensão só no cliente → alta.
function casarSuspensao(nomeCaso, clienteId, suspensoes) {
  const doCliente = suspensoes.filter(s => s.cliente_id === clienteId)
  if (!doCliente.length) return null
  if (nomeCaso) {
    const porProcesso = doCliente.filter(s => s.processo && mesmoCodigo(nomeCaso, s.processo))
    if (porProcesso.length === 1) return { suspensao: porProcesso[0], confianca: 'alta' }
  }
  if (doCliente.length === 1) return { suspensao: doCliente[0], confianca: 'alta' }
  return { suspensao: doCliente[0], confianca: 'ambigua' }
}

module.exports = {
  parseCaminho, limparNomeCliente, incluirArquivo, tipoDocumento,
  casarClientePorNome, casarAIT, casarSuspensao, semAcento,
}
```

- [ ] **Step 4: Rodar testes até passar**

Run: `cd automacao && node --test test/migracao.test.js`
Expected: todos PASS (ajustar regexes de `tipoDocumento` se algum caso falhar — os testes são a especificação)

- [ ] **Step 5: Commit**

```bash
git add automacao/migracao/matching.js automacao/test/migracao.test.js
git commit -m "feat(fase4): matching puro da migracao (parse de caminhos + casamento com banco)"
```

---

### Task 2: Loader de dados completos no supabase.js

**Files:**
- Modify: `automacao/supabase.js`

- [ ] **Step 1: Adicionar loader + getClient antes do module.exports**

```js
// Migração do legado precisa de TUDO (AITs encerradas inclusive) e do
// client para gerar o JWT dos uploads no worker.
async function carregarTudoMigracao() {
  const [aits, placas, clientes, suspensoes, documentos] = await Promise.all([
    buscarTudo(client.from('aits').select('id, codigo, placa_id')),
    buscarTudo(client.from('placas').select('id, cliente_id')),
    buscarTudo(client.from('clientes').select('id, nome')),
    buscarTudo(client.from('suspensoes').select('id, cliente_id, processo')),
    buscarTudo(client.from('documentos').select('id, ait_id, cliente_id, suspensao_id, nome_arquivo, tamanho_bytes')),
  ])
  return { aits, placas, clientes, suspensoes, documentos }
}

function getClient() { return client }
```

E no `module.exports`, acrescentar `carregarTudoMigracao, getClient`.

- [ ] **Step 2: Sintaxe + commit**

```bash
cd automacao && node --check supabase.js
git add automacao/supabase.js
git commit -m "feat(fase4): loader completo e getClient para a migracao"
```

---

### Task 3: Inventário (varredura do share + plano CSV)

**Files:**
- Create: `automacao/migracao/inventario.js`

- [ ] **Step 1: Implementar**

```js
// ─── INVENTÁRIO (migração do legado) ─────────────────────────
// Varre o share em SOMENTE LEITURA e monta o plano de migração.
// Nada aqui escreve no share nem no banco.
const fs = require('fs')
const path = require('path')
const M = require('./matching')

const SHARE = '\\\\100.110.210.37\\Zero Pontos'
const MAX_BYTES = 25 * 1024 * 1024

function* andar(dir) {
  let entradas
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }) }
  catch { return } // pasta inacessível: pula, não derruba a varredura
  for (const e of entradas) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* andar(p)
    else yield p
  }
}

// Percorre só a árvore de defesas e devolve o plano: uma linha por arquivo.
function montarPlano(dados, raiz = SHARE) {
  const base = path.join(raiz, '1. NOVO MODELO DEFESAS ADMINISTRATIVAS')
  const linhas = []
  // índice de duplicados: docs já no cofre por (dono|nome|tamanho)
  const jaSubidos = new Set(dados.documentos.map(d =>
    [(d.ait_id || d.cliente_id || d.suspensao_id), d.nome_arquivo, d.tamanho_bytes].join('|')))

  for (const abs of andar(base)) {
    const rel = abs.slice(raiz.length + 1)
    const p = M.parseCaminho(rel)
    if (!p) continue
    if (!M.incluirArquivo(p.arquivo)) continue

    let tamanho = 0
    try { tamanho = fs.statSync(abs).size } catch {}

    const linha = {
      caminho: rel, arquivo: p.arquivo, tamanho,
      categoria: p.categoria, ano: p.ano,
      cliente_pasta: p.clientePasta, caso: p.caso || '',
      tipo: M.tipoDocumento(p.arquivo),
      acao: '', destino: '', destino_nome: '', confianca: '', motivo: '',
    }

    const cliente = M.casarClientePorNome(p.clientePasta, dados.clientes)
    if (!cliente) {
      Object.assign(linha, { acao: 'revisar', motivo: 'cliente não encontrado no banco' })
      linhas.push(linha); continue
    }
    linha.destino_nome = cliente.nome

    if (tamanho > MAX_BYTES) {
      Object.assign(linha, { acao: 'pular_grande', motivo: `> 25 MB (${(tamanho / 1048576).toFixed(0)} MB)` })
      linhas.push(linha); continue
    }

    let dono = null
    if (!p.caso || ['CNH', 'CRLV', 'Procuracao'].includes(linha.tipo) && !p.caso) {
      dono = { col: 'cliente_id', id: cliente.id, conf: 'alta' }
    } else if (p.categoria === 'suspensao') {
      const r = M.casarSuspensao(p.caso, cliente.id, dados.suspensoes)
      if (r) dono = { col: 'suspensao_id', id: r.suspensao.id, conf: r.confianca }
    } else {
      const r = M.casarAIT(p.caso, cliente.id, dados)
      if (r) dono = { col: 'ait_id', id: r.ait.id, conf: r.confianca }
    }

    if (!dono) {
      // caso sem AIT/suspensão casada: anexa no CLIENTE como fallback seguro,
      // marcado pra revisão (melhor achável no cliente do que ficar de fora)
      Object.assign(linha, {
        acao: 'revisar', destino: 'cliente_id:' + cliente.id,
        motivo: p.caso ? 'caso sem código casado — sugerido anexar no cliente' : 'arquivo solto do cliente',
      })
      linhas.push(linha); continue
    }

    const chaveDup = [dono.id, p.arquivo, tamanho].join('|')
    Object.assign(linha, {
      acao: jaSubidos.has(chaveDup) ? 'ja_subido' : (dono.conf === 'alta' ? 'subir' : 'revisar'),
      destino: dono.col + ':' + dono.id,
      confianca: dono.conf,
      motivo: dono.conf === 'ambigua' ? 'mais de um destino possível' : '',
    })
    linhas.push(linha)
  }
  return linhas
}

// CSV com ; e BOM — abre certo no Excel PT-BR
function gravarCSV(linhas, arquivo) {
  const cols = ['acao', 'confianca', 'tipo', 'destino', 'destino_nome', 'categoria', 'ano',
                'cliente_pasta', 'caso', 'arquivo', 'tamanho', 'motivo', 'caminho']
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
  const csv = '﻿' + cols.join(';') + '\n' +
    linhas.map(l => cols.map(c => esc(l[c])).join(';')).join('\n')
  fs.writeFileSync(arquivo, csv, 'utf8')
}

function lerCSV(arquivo) {
  const txt = fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '')
  const [cab, ...rows] = txt.split(/\r?\n/).filter(Boolean)
  const cols = cab.split(';').map(c => c.replace(/^"|"$/g, ''))
  return rows.map(r => {
    // parser de CSV com aspas: divide em ; fora de aspas
    const vals = r.match(/("([^"]|"")*"|[^;]*)(;|$)/g).map(v =>
      v.replace(/;$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'))
    const o = {}
    cols.forEach((c, i) => { o[c] = vals[i] })
    o.tamanho = parseInt(o.tamanho, 10) || 0
    return o
  })
}

module.exports = { montarPlano, gravarCSV, lerCSV, SHARE, MAX_BYTES }
```

- [ ] **Step 2: Sintaxe + commit**

```bash
cd automacao && node --check migracao/inventario.js
git add automacao/migracao/inventario.js
git commit -m "feat(fase4): inventario da migracao (varredura read-only + plano CSV)"
```

---

### Task 4: CLI migrar.js (dry-run + upload)

**Files:**
- Create: `automacao/migracao/migrar.js`

- [ ] **Step 1: Implementar**

```js
// ─── MIGRAR ──────────────────────────────────────────────────
// node migracao/migrar.js               → dry-run: gera plano-migracao.csv
// node migracao/migrar.js --upload CSV  → sobe as linhas com acao=subir
// (linhas "revisar" só sobem se a ação for editada para "subir" no Excel)
const fs = require('fs')
const path = require('path')
const sb = require('../supabase')
const inv = require('./inventario')

const WORKER_URL = 'https://zp-docs.eduardo-f-pereira7.workers.dev'
const PREFIXO = { ait_id: 'aits', cliente_id: 'clientes', suspensao_id: 'suspensoes' }

function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
}

async function dryRun() {
  console.log('Login no Supabase...')
  await sb.login()
  console.log('Carregando banco...')
  const dados = await sb.carregarTudoMigracao()
  console.log(`  ${dados.aits.length} AITs · ${dados.clientes.length} clientes · ${dados.suspensoes.length} suspensões · ${dados.documentos.length} docs já no cofre`)
  console.log('Varrendo o share (somente leitura)...')
  const plano = inv.montarPlano(dados)
  const csv = path.join(__dirname, 'plano-migracao.csv')
  inv.gravarCSV(plano, csv)

  const porAcao = {}
  for (const l of plano) porAcao[l.acao] = (porAcao[l.acao] || 0) + 1
  console.log('\n=== PLANO GERADO (nada foi enviado) ===')
  for (const [acao, n] of Object.entries(porAcao).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${acao.padEnd(12)} ${n}`)
  }
  console.log(`\nRevisar no Excel: ${csv}`)
  console.log('Depois: node migracao/migrar.js --upload migracao/plano-migracao.csv')
}

async function upload(csvPath) {
  await sb.login()
  const { data: sess } = await sb.getClient().auth.getSession()
  const jwt = sess.session.access_token
  const linhas = inv.lerCSV(csvPath).filter(l => l.acao === 'subir')
  console.log(`${linhas.length} arquivos para subir.`)

  let ok = 0, falhas = 0
  for (const [i, l] of linhas.entries()) {
    const [col, donoId] = l.destino.split(':')
    if (!PREFIXO[col] || !donoId) { console.log(`PULA (destino inválido): ${l.caminho}`); falhas++; continue }
    try {
      const abs = path.join(inv.SHARE, l.caminho)
      const buf = fs.readFileSync(abs)
      const id = genId('d')
      const ext = (l.arquivo.split('.').pop() || 'bin').toLowerCase()
      const r2Key = `${PREFIXO[col]}/${donoId}/${id}.${ext}`
      const resp = await fetch(`${WORKER_URL}/doc?key=${encodeURIComponent(r2Key)}`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/octet-stream' },
        body: buf,
      })
      if (!resp.ok) throw new Error('worker ' + resp.status)
      const { error } = await sb.getClient().from('documentos').insert({
        id, [col]: donoId, tipo: l.tipo || 'Outro',
        nome_arquivo: l.arquivo, r2_key: r2Key,
        tamanho_bytes: l.tamanho, mime: 'application/octet-stream',
      })
      if (error) throw new Error(error.message)
      ok++
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${linhas.length}...`)
    } catch (e) {
      falhas++
      console.log(`FALHA: ${l.caminho} — ${e.message}`)
    }
  }
  console.log(`\nConcluído: ${ok} enviados, ${falhas} falhas.`)
  console.log('Rodar o dry-run de novo mostra os enviados como "ja_subido" (retomável).')
}

const args = process.argv.slice(2)
const mode = args[0] === '--upload' ? upload(args[1]) : dryRun()
mode.catch(e => { console.error('ERRO:', e.message); process.exit(1) })
```

- [ ] **Step 2: Sintaxe + commit**

```bash
cd automacao && node --check migracao/migrar.js
git add automacao/migracao/migrar.js
git commit -m "feat(fase4): CLI de migracao (dry-run gera CSV; upload le CSV aprovado)"
```

---

### Task 5: Rodar o dry-run real e revisar a taxa de acerto

- [ ] **Step 1: Executar**

Run: `cd automacao && node migracao/migrar.js`
Expected: resumo com contagens por ação (`subir`, `revisar`, `ja_subido`, `pular_grande`) e `plano-migracao.csv` gerado. NENHUM upload.

- [ ] **Step 2: Analisar a qualidade do matching**

Ler amostras do CSV: conferir se `subir` aponta pro destino certo e se o volume de `revisar` é aceitável (<30%). Se a taxa de `revisar` for alta por um padrão sistemático (ex.: prefixo de código não coberto), ajustar `matching.js`, re-testar, rodar de novo.

- [ ] **Step 3: CHECKPOINT usuário — revisão do CSV**

Usuário abre `plano-migracao.csv` no Excel, confere amostras, ajusta ações (`revisar` → `subir` onde concordar) e autoriza o upload.

- [ ] **Step 4: Upload (só após autorização)**

Run: `cd automacao && node migracao/migrar.js --upload migracao/plano-migracao.csv`

- [ ] **Step 5: Commit final + push**

```bash
git add -A && git commit -m "feat(fase4): migracao do legado executada" && git push origin main
```
