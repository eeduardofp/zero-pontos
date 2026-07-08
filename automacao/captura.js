// ─── CAPTURA (Etapa 0) ───────────────────────────────────────
// Salva HTML renderizado do dossiê em fixtures/ para desenvolver o parser.
//
// Uso:
//   node captura.js --login                 abre Chrome SEM automação para fazer
//                                           login (captcha funciona normal); a
//                                           sessão fica salva no perfil
//   node captura.js PLACA1:RENAVAM1 [...]   captura fixtures reusando a sessão
const { chromium } = require('playwright')
const { spawn } = require('child_process')
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
// A sessão fica gravada no mesmo perfil que a captura usa depois.
function modoLogin() {
  fs.mkdirSync(PROFILE, { recursive: true })
  const chrome = acharChrome()
  console.log('Abrindo Chrome (sem automação) para você fazer login no Detran Digital...')
  console.log('1. Faça o login normalmente (captcha deve funcionar).')
  console.log('2. Confirme que a consulta de veículos abre.')
  console.log('3. FECHE o Chrome por completo.')
  console.log('4. Rode a captura: node captura.js PLACA:RENAVAM')
  spawn(chrome, [
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    BASE
  ], { detached: true, stdio: 'ignore' }).unref()
}

async function capturar(alvos) {
  fs.mkdirSync(FIXTURES, { recursive: true })
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled']
  })
  const page = ctx.pages()[0] || await ctx.newPage()

  // Diagnóstico: se true, site ainda consegue ver a automação por este sinal
  await page.goto('about:blank')
  console.log('diagnóstico navigator.webdriver =', await page.evaluate(() => navigator.webdriver))

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

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--login')) return modoLogin()

  const alvos = args.map(s => {
    const [placa, renavam] = s.split(':')
    if (!placa || !renavam) throw new Error(`Argumento inválido: "${s}" — use PLACA:RENAVAM`)
    return { placa, renavam }
  })
  if (!alvos.length) {
    console.log('Uso: node captura.js --login | node captura.js PLACA1:RENAVAM1 [PLACA2:RENAVAM2 ...]')
    process.exit(1)
  }
  await capturar(alvos)
}

main().catch(e => { console.error(e); process.exit(1) })
