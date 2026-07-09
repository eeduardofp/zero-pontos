// ─── RELATÓRIO ───────────────────────────────────────────────
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const COR = {
  atualizado: '#16a34a',
  'sem-mudanca': '#64748b',
  'nao-encontrado': '#d97706',
  'sem-permissao': '#dc2626',
  'pulado-protegido': '#a855f7',
  'dados-invalidos': '#eab308',
  limite: '#f97316',
  erro: '#dc2626'
}

// Caminho único por execução — permite regravar o mesmo arquivo a cada placa
// (relatório incremental: sobrevive a interrupção/limite no meio da rodada).
function novoCaminho() {
  const dir = path.join(__dirname, 'logs')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `relatorio-${new Date().toISOString().replace(/[:.]/g, '-')}.html`)
}

// itens: [{ cliente, placa, codigo, tipo, antes, depois, vencimento, detalhe }]
function gerar(itens, dryRun, arqFixo) {
  const resumo = {}
  for (const i of itens) resumo[i.tipo] = (resumo[i.tipo] || 0) + 1

  const linhas = itens.map(i => `<tr>
    <td>${i.cliente || '—'}</td><td>${i.placa || '—'}</td><td>${i.codigo || '—'}</td>
    <td style="color:${COR[i.tipo] || '#64748b'};font-weight:600">${i.tipo}</td>
    <td style="${i.alteracao ? 'color:#16a34a;font-weight:600' : ''}">${i.alteracao || '—'}</td>
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
<table><tr><th>Cliente</th><th>Placa</th><th>AIT</th><th>Resultado</th><th>Alteração</th><th>Antes</th><th>Depois</th><th>Vencimento</th><th>Detalhe</th></tr>
${linhas}</table></body></html>`

  const arq = arqFixo || novoCaminho()
  fs.writeFileSync(arq, html)
  return arq
}

function abrir(arq) {
  try { execSync(`start "" "${arq}"`, { shell: 'cmd.exe' }) } catch {}
}

module.exports = { gerar, abrir, novoCaminho }
