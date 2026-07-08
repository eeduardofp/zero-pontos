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
