// ─── CAPTURA SUSPENSÕES (Etapa 0) ────────────────────────────
// Salva o HTML renderizado da tela "DADOS DO PROCESSO" do serviço de
// suspensões (/infracoes) em fixtures/, para desenvolver o parser com TDD.
//
// Uso:
//   node captura-suspensoes.js --login          abre Chrome SEM automação p/ login
//                                               (captcha funciona normal)
//   node captura-suspensoes.js ROTULO           captura a tela atual; você cola
//                                               protocolo+senha no site, abre o
//                                               processo, e dá Enter para salvar
//   node captura-suspensoes.js ROTULO1 ROTULO2  captura várias em sequência
//
// ROTULO vira o nome do arquivo: fixtures/suspensao-<ROTULO>.html
// Sugestão de rótulos: aguardando-defesa, aguardando-jari, aguardando-cetran
const { chromium } = require('playwright')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const BASE = 'https://servicos.detran.sc.gov.br/habilitacao?consultarProcessoSuspensao=true'
const PROFILE = path.join(__dirname, 'chrome-profile')
const FIXTURES = path.join(__dirname, 'fixtures')

function perguntar(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(msg, ans => { rl.close(); res(ans) }))
}

function acharChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
  ].filter(Boolean)
  const achado = candidatos.find(p => fs.existsSync(p))
  if (!achado) throw new Error('chrome.exe não encontrado. Defina CHROME_PATH no .env ou ambiente.')
  return achado
}

// Modo login: Chrome puro, sem Playwright/CDP — captcha vê browser 100% normal.
function modoLogin() {
  fs.mkdirSync(PROFILE, { recursive: true })
  const chrome = acharChrome()
  console.log('Abrindo Chrome (sem automação) para login no Detran Digital...')
  console.log('1. Faça o login normalmente (captcha deve funcionar).')
  console.log('2. Confirme que a página de infrações/suspensões abre.')
  console.log('3. FECHE o Chrome por completo.')
  console.log('4. Rode a captura: node captura-suspensoes.js aguardando-jari')
  spawn(chrome, [
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    BASE
  ], { detached: true, stdio: 'ignore' }).unref()
}

async function capturar(rotulos) {
  fs.mkdirSync(FIXTURES, { recursive: true })
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled']
  })
  const page = ctx.pages()[0] || await ctx.newPage()

  await page.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {})
  console.log('diagnóstico navigator.webdriver =', await page.evaluate(() => navigator.webdriver).catch(() => '?'))

  for (const rotulo of rotulos) {
    console.log(`\n→ Captura "${rotulo}"`)
    await perguntar(
      'No site: cole PROTOCOLO + SENHA de um processo, abra os "DADOS DO PROCESSO"\n' +
      '(a tela com FASE e PRAZO LIMITE). Quando estiver visível, pressione Enter para salvar... '
    )
    const html = await page.content()
    const arq = path.join(FIXTURES, `suspensao-${rotulo}.html`)
    fs.writeFileSync(arq, html)
    await page.screenshot({ path: path.join(FIXTURES, `suspensao-${rotulo}.png`), fullPage: true }).catch(() => {})
    console.log(`  salvo: ${arq}`)
  }

  await ctx.close()
  console.log('\nPronto. Me avise os rótulos capturados que eu construo o parser contra eles.')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--login')) return modoLogin()
  if (!args.length) {
    console.log('Uso: node captura-suspensoes.js --login | node captura-suspensoes.js ROTULO [ROTULO2 ...]')
    console.log('Ex.: node captura-suspensoes.js aguardando-defesa aguardando-jari aguardando-cetran')
    process.exit(1)
  }
  await capturar(args)
}

main().catch(e => { console.error(e); process.exit(1) })
