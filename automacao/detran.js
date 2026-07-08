// ─── DETRAN ──────────────────────────────────────────────────
// Extração de dados do dossiê do veículo (Detran Digital SC).
// Seletores calibrados pelas fixtures capturadas na Etapa 0 (captura.js).
// Estrutura real: seções em accordions (.accordion), cards em
// .box-destaque.lista-dados com pares .lista-dados__item--title / <p>.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const M = require('./mapeamento.js')

const BASE = 'https://servicos.detran.sc.gov.br/consulta-dossie-veiculo'
const PROFILE = path.join(__dirname, 'chrome-profile')
const LOGS = path.join(__dirname, 'logs')

const SEL = {
  accordion: '.accordion',
  accordionTitulo: '.accordion-header__title',
  accordionHeader: '.accordion-header',
  card: '.box-destaque.lista-dados',
  item: '.lista-dados__item',
  itemTitulo: '.lista-dados__item--title',
  paginacao: '.paginacao',
  // Mensagem real capturada (fixture dossie-MKK3J84-protegido.html):
  // "Erro ao consultar dossiê de veículo O veículo consultado está protegido."
  erroPermissao: /ve[íi]culo consultado est[áa] protegido|não possui permissão|sem permissão|não autorizado/i,
  debitosVazio: '.lista-debitos--empty'
}

// Campo "Processo" do card → campo da AIT no workspace.
// "Indicação Condutor" e afins não são etapas da esteira → null (ignorar).
const INSTANCIAS = [
  { re: /defesa/i, campo: 'defesa_previa' },
  { re: /jari/i, campo: 'jari' },
  { re: /cetran|2ª inst|segunda inst/i, campo: 'segunda_instancia' }
]

function instanciaDoProcesso(processo) {
  const hit = INSTANCIAS.find(x => x.re.test(processo || ''))
  return hit ? hit.campo : null
}

// Localiza o accordion cujo título casa com o regex
function accordionPorTitulo(page, re) {
  return page.locator(SEL.accordion).filter({
    has: page.locator(SEL.accordionTitulo, { hasText: re })
  }).first()
}

// Lê os cards de recursos da PÁGINA ATUAL do accordion.
// → [{ processo, instancia, resultado, texto }]
// `texto` é o conteúdo completo do card — o código da AIT é procurado por
// substring nele (aparece em "Identificador do Auto"/"Detalhamento").
async function extractRecursos(page) {
  const acc = accordionPorTitulo(page, /RECURSOS DE INFRA/i)
  if (await acc.count() === 0) return []
  return acc.locator(SEL.card).evaluateAll((cards, sel) =>
    cards.map(card => {
      const campos = {}
      card.querySelectorAll(sel.item).forEach(item => {
        const t = item.querySelector(sel.itemTitulo)
        if (!t) return
        campos[t.textContent.trim()] = item.textContent.replace(t.textContent, '').trim().replace(/\s+/g, ' ')
      })
      return {
        processo: campos['Processo'] || '',
        requerimento: campos['Requerimento'] || '',
        resultado: campos['Resultado do Processo'] || '',
        texto: card.textContent.replace(/\s+/g, ' ')
      }
    }), SEL
  ).then(cards => cards.map(c => ({
    ...c,
    instancia: instanciaDoProcesso(c.processo),
    // data do requerimento ("Em 29/04/2026 pelo...") — usada para ordenar
    // processos do mesmo auto: o site lista mais novo primeiro
    dataRequerimento: M.parseDataBR((/(\d{1,2}\/\d{1,2}\/\d{4})/.exec(c.requerimento) || [])[1] || '')
  })))
}

// Lê débitos da página atual do accordion DÉBITOS.
// → [{ texto, data: 'aaaa-mm-dd' }] — código da AIT procurado por substring em `texto`.
// PROVISÓRIO: só o estado vazio foi capturado; estrutura de débitos reais
// será calibrada com fixture nova (extração genérica: bloco com data).
async function extractDebitos(page) {
  const acc = accordionPorTitulo(page, /D[ÉE]BITOS/i)
  if (await acc.count() === 0) return []
  if (await acc.locator(SEL.debitosVazio).count() > 0) return []
  const blocos = await acc.locator('.lista-debitos > *, ' + SEL.card).evaluateAll(els =>
    els.map(el => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)
  )
  const out = []
  for (const texto of blocos) {
    const m = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(texto)
    const data = m ? M.parseDataBR(m[1]) : null
    if (data) out.push({ texto, data })
  }
  return out
}

async function isPermissaoNegada(page) {
  const corpo = await page.locator('body').innerText().catch(() => '')
  return SEL.erroPermissao.test(corpo)
}

// ─── NAVEGAÇÃO ───────────────────────────────────────────────

// Flags anti-detecção: sem elas o captcha do login rejeita solução correta
// (navigator.webdriver=true denuncia automação). Login em si nunca acontece
// sob automação — usuário loga via `captura.js --login` e a sessão fica no perfil.
async function abrirBrowser() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled']
  })
  return { ctx, page: ctx.pages()[0] || await ctx.newPage() }
}

// Se o site redirecionar para login, espera o usuário logar manualmente.
function emTelaDeLogin(page) {
  return /login|sso|acesso|auth/i.test(page.url()) && !page.url().includes('consulta-dossie')
}

async function garantirLogado(page) {
  if (!emTelaDeLogin(page)) return
  console.log('\n*** Sessão expirou. Faça login no Detran Digital na janela do Chrome. ***')
  console.log('*** A automação continua sozinha depois do login. ***')
  while (emTelaDeLogin(page)) await page.waitForTimeout(2000)
  await page.waitForLoadState('networkidle').catch(() => {})
}

// Garante que um accordion está expandido E com conteúdo carregado.
// O container .accordion-content pode existir no DOM fechado e vazio —
// o conteúdo só é buscado na rede quando o header é clicado. Por isso a
// decisão é por visibilidade, e a espera é por conteúdo real (cards ou
// mensagem de vazio), não por tempo fixo.
async function abrirAccordion(page, tituloRe) {
  const acc = accordionPorTitulo(page, tituloRe)
  if (await acc.count() === 0) return false

  const conteudo = acc.locator('.accordion-content')
  const visivel = await conteudo.first().isVisible().catch(() => false)
  if (!visivel) {
    await acc.locator(SEL.accordionHeader).first().click()
  }

  // espera carregar: algum card OU texto de "nenhum registro"
  const inicio = Date.now()
  while (Date.now() - inicio < 20000) {
    if (await acc.locator(SEL.card).count() > 0) return true
    const txt = await conteudo.first().innerText().catch(() => '')
    if (txt.trim().length > 0) return true
    await page.waitForTimeout(500)
  }
  console.log(`  aviso: accordion ${tituloRe} não carregou conteúdo em 20s`)
  return true
}

// Percorre todas as páginas de um accordion paginado, acumulando via extrator
async function extrairComPaginacao(page, tituloRe, extrator) {
  const acc = accordionPorTitulo(page, tituloRe)
  if (await acc.count() === 0) return []
  const out = [...await extrator(page)]
  const proximo = () => acc.locator(`${SEL.paginacao} button:not([disabled])`).filter({
    has: page.locator('.fa-arrow-right')
  })
  let paginas = 1
  while (await proximo().count() > 0 && paginas < 50) {
    await proximo().first().click()
    await page.waitForTimeout(800)
    out.push(...await extrator(page))
    paginas++
  }
  return out
}

// Abre o dossiê de uma placa e deixa as seções necessárias prontas.
// Fluxo real do site: a URL pré-preenche o formulário, mas é preciso clicar
// em CONSULTAR DOSSIÊ VEÍCULO; o dossiê demora alguns segundos para montar.
async function abrirDossie(page, placa, renavam) {
  await page.goto(`${BASE}?placa=${placa}&renavam=${renavam}`, { waitUntil: 'domcontentloaded' })
  await garantirLogado(page)

  const btnConsultar = page.locator('button').filter({ hasText: /CONSULTAR DOSSI/i }).first()
  await btnConsultar.waitFor({ timeout: 30000 })

  // Confere/preenche o formulário caso a URL não tenha pré-preenchido
  const campos = page.locator('input[type="text"]:visible')
  if (await campos.count() >= 2) {
    if ((await campos.nth(0).inputValue()) !== placa) await campos.nth(0).fill(placa)
    if ((await campos.nth(1).inputValue()) !== String(renavam)) await campos.nth(1).fill(String(renavam))
  }
  await btnConsultar.click()

  // Espera dossiê montar (accordions) OU erro de permissão — backend é lento
  const inicio = Date.now()
  while (Date.now() - inicio < 60000) {
    if (await page.locator(SEL.accordion).count() > 0) break
    if (await isPermissaoNegada(page)) return
    await page.waitForTimeout(1000)
  }
  if (await page.locator(SEL.accordion).count() === 0) {
    if (await isPermissaoNegada(page)) return
    throw new Error('Dossiê não carregou em 60s')
  }
  await abrirAccordion(page, /RECURSOS DE INFRA/i)
  await abrirAccordion(page, /D[ÉE]BITOS/i)
}

// Recursos e débitos completos (todas as páginas)
function todosRecursos(page) {
  return extrairComPaginacao(page, /RECURSOS DE INFRA/i, extractRecursos)
}
function todosDebitos(page) {
  return extrairComPaginacao(page, /D[ÉE]BITOS/i, extractDebitos)
}

async function screenshotErro(page, placa) {
  fs.mkdirSync(LOGS, { recursive: true })
  const arq = path.join(LOGS, `erro-${placa}-${Date.now()}.png`)
  try { await page.screenshot({ path: arq, fullPage: true }) } catch {}
  return arq
}

module.exports = {
  extractRecursos, extractDebitos, isPermissaoNegada, instanciaDoProcesso, SEL,
  abrirBrowser, garantirLogado, abrirDossie, todosRecursos, todosDebitos, screenshotErro
}
