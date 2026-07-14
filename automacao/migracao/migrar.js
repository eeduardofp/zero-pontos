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
  console.log(`  total de arquivos elegíveis: ${plano.length}`)
  for (const [acao, n] of Object.entries(porAcao).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${acao.padEnd(14)} ${n}`)
  }
  const gb = plano.filter(l => l.acao === 'subir').reduce((s, l) => s + l.tamanho, 0) / 1073741824
  console.log(`  volume a subir: ${gb.toFixed(2)} GB`)
  console.log(`\nRevisar no Excel: ${csv}`)
  console.log('Depois: node migracao/migrar.js --upload migracao/plano-migracao.csv')
}

async function upload(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) {
    throw new Error('informe o CSV revisado: node migracao/migrar.js --upload migracao/plano-migracao.csv')
  }
  console.log('Login no Supabase...')
  await sb.login()
  const { data: sess } = await sb.getClient().auth.getSession()
  const jwt = sess.session.access_token
  const linhas = inv.lerCSV(csvPath).filter(l => l.acao === 'subir')
  console.log(`${linhas.length} arquivos para subir.`)

  let ok = 0, falhas = 0
  const inicio = Date.now()
  for (const [i, l] of linhas.entries()) {
    const [col, donoId] = String(l.destino).split(':')
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
      if ((ok + falhas) % 50 === 0) {
        const min = ((Date.now() - inicio) / 60000).toFixed(1)
        console.log(`  ${i + 1}/${linhas.length} (${min} min)...`)
      }
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
