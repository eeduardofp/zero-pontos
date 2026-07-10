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
  // Limite de consultas do Detran atingido (texto amplo — refinar se aparecer
  // variação; classificarDossie salva o texto real em logs quando não classifica).
  limiteConsultas: /limite (de|diário de|máximo de)? ?consultas|consultas? (excedid|atingid|esgotad)|número máximo de consultas|quantidade máxima de consultas|excedeu o limite/i,
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

// Lê os cards da PÁGINA ATUAL do accordion INFRAÇÕES (usado pelo garimpo
// comercial). Título ancorado para não casar com "RECURSOS DE INFRAÇÃO".
// → [{ numeroAuto, descricao, valorMulta, limiteDefesa, texto }]
// "Limite para defesa em dd/mm/aaaa" aparece solto no item Situação.
const RE_INFRACOES = /^\s*INFRA[ÇC][ÕO]ES\s*$/i

async function extractInfracoes(page) {
  const acc = accordionPorTitulo(page, RE_INFRACOES)
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
        numeroAuto: campos['Número Auto'] || '',
        descricao: campos['Descrição'] || '',
        valorTxt: campos['Valor da Multa'] || '',
        texto: card.textContent.replace(/\s+/g, ' ')
      }
    }), SEL
  ).then(cards => cards.filter(c => c.numeroAuto).map(c => ({
    numeroAuto: c.numeroAuto,
    descricao: c.descricao,
    valorMulta: M.parseValorBR(c.valorTxt),
    limiteDefesa: M.parseDataBR((/limite para defesa em (\d{1,2}\/\d{1,2}\/\d{4})/i.exec(c.texto) || [])[1] || ''),
    texto: c.texto
  })))
}

// Lê débitos da página atual do accordion DÉBITOS.
// → [{ codigo, texto, data: 'aaaa-mm-dd', valor: number|null }]
// Estrutura real (fixture RYT0A74): .lista-debitos__item com células
// código | vencimento | valor | botões. O 1º item é o cabeçalho da
// tabela (só <strong>) — cai fora por não ter data.
async function extractDebitos(page) {
  const acc = accordionPorTitulo(page, /D[ÉE]BITOS/i)
  if (await acc.count() === 0) return []
  if (await acc.locator(SEL.debitosVazio).count() > 0) return []
  const blocos = await acc.locator('.lista-debitos__item, ' + SEL.card).evaluateAll(els =>
    els.map(el => {
      const celulas = [...el.querySelectorAll(':scope > div')]
        .map(c => c.textContent.replace(/\s+/g, ' ').trim())
      return { celulas, texto: el.textContent.replace(/\s+/g, ' ').trim() }
    }).filter(b => b.texto)
  )
  const out = []
  for (const b of blocos) {
    const m = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(b.texto)
    const data = m ? M.parseDataBR(m[1]) : null
    if (!data) continue
    // célula do código: a que precede o vencimento e não é rótulo da tabela
    const idxData = b.celulas.findIndex(c => /\d{1,2}\/\d{1,2}\/\d{4}/.test(c))
    const codigo = idxData > 0 ? b.celulas[idxData - 1] : ''
    const valorCel = b.celulas.find(c => /R\$/.test(c)) || b.texto
    out.push({ codigo, texto: b.texto, data, valor: M.parseValorBR(valorCel) })
  }
  return out
}

async function isPermissaoNegada(page) {
  const corpo = await page.locator('body').innerText().catch(() => '')
  return SEL.erroPermissao.test(corpo)
}

// ─── NAVEGAÇÃO ───────────────────────────────────────────────

// Apaga a sessão salva (perfil do Chrome) para forçar login limpo a cada
// execução. Chamado antes de abrir o browser — permite trocar de conta.
function limparSessao() {
  try { fs.rmSync(PROFILE, { recursive: true, force: true }) } catch {}
}

// Flags anti-detecção: sem elas o captcha do login rejeita solução correta
// (navigator.webdriver=true denuncia automação). Com elas, o login manual
// na janela funciona normalmente (captcha inclusive).
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

// Abre a página de consulta (tela onde o site pede login se não houver sessão).
async function irParaInicio(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {})
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

async function isLimiteAtingido(page) {
  const corpo = await page.locator('body').innerText().catch(() => '')
  return SEL.limiteConsultas.test(corpo)
}

// Classifica o desfecho da consulta na tela atual.
// → 'ok' | 'protegido' | 'limite' | 'erro'
async function classificarDossie(page) {
  if (await page.locator(SEL.accordion).count() > 0) return 'ok'
  if (await isPermissaoNegada(page)) return 'protegido'
  if (await isLimiteAtingido(page)) return 'limite'
  return 'erro'
}

// Abre o dossiê de uma placa e deixa as seções necessárias prontas.
// Fluxo real do site: a URL pré-preenche o formulário, mas é preciso clicar
// em CONSULTAR DOSSIÊ VEÍCULO; o dossiê demora alguns segundos para montar.
// Retorna: { status: 'ok'|'protegido'|'limite'|'erro', texto } — nunca lança
// por desfecho de negócio; o orquestrador decide o que fazer com cada status.
async function abrirDossie(page, placa, renavam, opcoes = {}) {
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

  // Espera um desfecho: accordions (ok), protegido, ou limite — backend é lento
  const inicio = Date.now()
  let status = 'erro'
  while (Date.now() - inicio < 60000) {
    status = await classificarDossie(page)
    if (status !== 'erro') break
    await page.waitForTimeout(1000)
  }

  if (status === 'ok') {
    await abrirAccordion(page, /RECURSOS DE INFRA/i)
    await abrirAccordion(page, /D[ÉE]BITOS/i)
    if (opcoes.incluirInfracoes) await abrirAccordion(page, RE_INFRACOES)
    return { status: 'ok', texto: '' }
  }

  // Desfecho não-ok: guarda o texto visível para diagnóstico/refino
  const texto = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 400)
  return { status, texto }
}

// ─── SUSPENSÕES DE CNH ───────────────────────────────────────
// Serviço de suspensão: consulta por protocolo+senha, sem placa.
// Sem fixture ainda — parsing por texto visível (resiliente a markup);
// desfecho não reconhecido gera screenshot para calibrar depois.
const URL_SUSPENSAO = 'https://servicos.detran.sc.gov.br/habilitacao?consultarProcessoSuspensao=true'

// → { status: 'ok'|'nao-encontrado'|'limite'|'erro', texto }
// 'ok' = tela "DADOS DO PROCESSO" visível; texto = innerText da página
// (o chamador extrai fase/prazo com mapeamentoSuspensoes.parseTelaSuspensao).
async function consultarSuspensao(page, protocolo, senha) {
  await page.goto(URL_SUSPENSAO, { waitUntil: 'domcontentloaded' })
  await garantirLogado(page)

  // Campos do formulário: tenta por atributo (placeholder/name/id), senão
  // cai nos dois primeiros inputs visíveis (protocolo, senha — nesta ordem).
  const visiveis = page.locator('input:visible')
  await visiveis.first().waitFor({ timeout: 30000 })
  let campoProto = page.locator('input[placeholder*="rotocolo" i], input[name*="rotocolo" i], input[id*="rotocolo" i]').first()
  let campoSenha = page.locator('input[placeholder*="enha" i], input[name*="enha" i], input[id*="enha" i], input[type="password"]').first()
  if (await campoProto.count() === 0) campoProto = visiveis.nth(0)
  if (await campoSenha.count() === 0) campoSenha = visiveis.nth(1)
  await campoProto.fill(protocolo)
  await campoSenha.fill(senha)
  await page.locator('button:visible').filter({ hasText: /CONSULTAR/i }).first().click()

  const inicio = Date.now()
  while (Date.now() - inicio < 60000) {
    const corpo = await page.locator('body').innerText().catch(() => '')
    if (/DADOS DO PROCESSO/i.test(corpo)) return { status: 'ok', texto: corpo }
    if (/(protocolo|senha)[^.\n]*(inv[áa]lid|incorret|n[ãa]o confere)/i.test(corpo) ||
        /processo n[ãa]o (encontrado|localizado)/i.test(corpo)) {
      return { status: 'nao-encontrado', texto: corpo.replace(/\s+/g, ' ').slice(0, 300) }
    }
    if (SEL.limiteConsultas.test(corpo)) return { status: 'limite', texto: '' }
    await page.waitForTimeout(1000)
  }
  const texto = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 400)
  return { status: 'erro', texto }
}

// Recursos e débitos completos (todas as páginas)
function todosRecursos(page) {
  return extrairComPaginacao(page, /RECURSOS DE INFRA/i, extractRecursos)
}
function todosDebitos(page) {
  return extrairComPaginacao(page, /D[ÉE]BITOS/i, extractDebitos)
}
function todasInfracoes(page) {
  return extrairComPaginacao(page, RE_INFRACOES, extractInfracoes)
}

async function screenshotErro(page, placa) {
  fs.mkdirSync(LOGS, { recursive: true })
  // sanitiza: placa do cadastro pode conter "/" ("EZS7E24/SP") e viraria pasta
  const nome = String(placa).replace(/[^0-9A-Za-z]/g, '')
  const arq = path.join(LOGS, `erro-${nome}-${Date.now()}.png`)
  try { await page.screenshot({ path: arq, fullPage: true }) } catch {}
  return arq
}

module.exports = {
  extractRecursos, extractDebitos, extractInfracoes, isPermissaoNegada, isLimiteAtingido, classificarDossie,
  instanciaDoProcesso, SEL,
  abrirBrowser, limparSessao, irParaInicio, garantirLogado, abrirDossie,
  todosRecursos, todosDebitos, todasInfracoes, consultarSuspensao, screenshotErro
}
