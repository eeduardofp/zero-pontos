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
// Perfil travado = Chrome zumbi de rodada anterior ainda aberto; se o novo
// Chrome abrir no mesmo perfil ele delega pro zumbi e morre ("browser has
// been closed") — melhor falhar aqui com mensagem clara.
function limparSessao() {
  try {
    fs.rmSync(PROFILE, { recursive: true, force: true })
  } catch (e) {
    throw new Error(
      'Não consegui limpar o perfil do Chrome da automação — provavelmente ' +
      'sobrou uma janela do Chrome de uma rodada anterior. Feche TODAS as ' +
      `janelas do Chrome da automação e tente de novo. (${e.code || e.message})`
    )
  }
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
// Testa só host+caminho da URL — query string NÃO: o parâmetro
// "consultarProcessoSuspensao" contém "sso" (Proce-SSO-...) e fazia o
// robô achar que estava eternamente na tela de login.
function emTelaDeLogin(page) {
  let u
  try { u = new URL(page.url()) } catch { return false }
  const alvo = u.hostname + u.pathname
  return /login|sso|acesso|auth/i.test(alvo) && !alvo.includes('consulta-dossie')
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

// Despeja o HTML e um screenshot da página no logs/ para calibração.
// Enquanto não há fixture do site de suspensões, todo desfecho não-ok
// grava a página real para eu ajustar seletores/parser sem adivinhar.
async function dumpSuspensao(page, rotulo) {
  fs.mkdirSync(LOGS, { recursive: true })
  const nome = String(rotulo).replace(/[^0-9A-Za-z]/g, '')
  const base = path.join(LOGS, `suspensao-${nome}-${Date.now()}`)
  try { fs.writeFileSync(`${base}.html`, await page.content()) } catch {}
  try { await page.screenshot({ path: `${base}.png`, fullPage: true }) } catch {}
  return `${base}.html`
}

// → { status: 'ok'|'nao-encontrado'|'limite'|'erro', texto, dump? }
// 'ok' = tela "DADOS DO PROCESSO" visível; texto = innerText da página
// (o chamador extrai fase/prazo com mapeamentoSuspensoes.parseTelaSuspensao).
async function consultarSuspensao(page, protocolo, senha, opcoes = {}) {
  const debug = opcoes.debug !== false   // calibração ligada por padrão (sem fixture)
  const log = opcoes.log || (() => {})   // telemetria de micro-passos (diagnóstico)

  // Modal "Acompanhar processo": campos com label flutuante ("Protocolo *",
  // "Senha de acesso *") e botão "ACESSAR". getByLabel casa label/placeholder;
  // se falhar, cai nos inputs de texto/senha visíveis do diálogo.
  const acharCampo = async (reLabel, tipoFallback) => {
    const porLabel = page.getByLabel(reLabel).first()
    if (await porLabel.count().catch(() => 0)) return porLabel
    return page.locator(`input${tipoFallback}:visible`).first()
  }

  // Logo após o login a sessão ainda pode não ter propagado para a rota
  // /habilitacao — o site recarrega e devolve a HOME DESLOGADA (sem modal).
  // Visto ao vivo em 2026-07-10: dump mostrou "Bem-vindo(a)... Acessar via
  // GOV.BR" e zero inputs. Corrida de timing → entra com até 4 tentativas.
  let campoProto = null
  for (let tentativa = 0; tentativa < 4 && !campoProto; tentativa++) {
    if (tentativa > 0) await page.waitForTimeout(3000)
    await page.goto(URL_SUSPENSAO, { waitUntil: 'domcontentloaded' })
    await garantirLogado(page)
    await page.waitForLoadState('networkidle').catch(() => {})
    const cand = await acharCampo(/protocolo/i, ':not([type="password"])')
    const visivel = await cand.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)
    log(`campo protocolo tentativa ${tentativa + 1}: visível=${visivel}`)
    if (visivel) campoProto = cand
  }
  if (!campoProto) {
    const dump = debug ? await dumpSuspensao(page, `form-${protocolo}`) : null
    const texto = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 400)
    return { status: 'erro', texto: `formulário de protocolo não encontrado. ${texto}`, dump }
  }
  const campoSenha = await acharCampo(/senha/i, '[type="password"]')

  // Digitação tecla a tecla: fill() injeta o valor de uma vez e o formulário
  // Angular NÃO registra (validado em diagnóstico real 2026-07-10 — com fill o
  // clique em ACESSAR não disparava nada; com pressSequentially o POST
  // /transito-api/processo/buscar dispara e a tela DADOS DO PROCESSO abre).
  const digitar = async (campo, valor) => {
    await campo.click()
    await campo.press('Control+a')
    await campo.press('Delete')
    await campo.pressSequentially(valor, { delay: 40 })
    await campo.press('Tab')
  }
  await digitar(campoProto, protocolo)
  await digitar(campoSenha, senha)
  log(`digitado: protocolo(${protocolo.length} chars) e senha(${senha.length} chars)`)

  // NÃO clicar no banner de cookies: medido ao vivo (2026-07-10), o clique
  // "de proteção" no Ok era o que QUEBRAVA o ACESSAR (com o banner intacto a
  // consulta funciona; após o force-click no Ok o botão fica inclicável).

  // valores realmente registrados nos inputs (o que o Angular vê)
  const valores = await page.locator('input:visible').evaluateAll(els =>
    els.map(el => ({ id: el.id, len: (el.value || '').length }))).catch(() => [])
  log(`inputs visíveis pós-digitação: ${JSON.stringify(valores)}`)

  // Clique em ACESSAR com 3 camadas: clique normal → clique direto no DOM
  // (ignora overlay que intercepte o ponteiro) → Enter no campo de senha.
  const botao = page.getByRole('button', { name: /acessar/i }).first()
  log(`botão ACESSAR: count=${await botao.count().catch(() => '?')} enabled=${await botao.isEnabled().catch(() => '?')}`)
  const clicou = await botao.click({ timeout: 8000 }).then(() => true).catch(e => { log(`clique normal falhou: ${String(e.message).split('\n')[0]}`); return false })
  log(`clique normal: ${clicou}`)
  if (!clicou) {
    const viaDOM = await botao.evaluate(el => { el.click(); return true }).catch(() => false)
    log(`clique via DOM: ${viaDOM}`)
    if (!viaDOM) { await campoSenha.press('Enter').catch(() => {}); log('fallback: Enter na senha') }
  }

  // Espera o desfecho; se em 15s nada mudou, re-clica ACESSAR (o handler do
  // Angular às vezes ainda não está ligado no primeiro clique) — até 3 cliques.
  const inicio = Date.now()
  let ultimoClique = Date.now()
  let cliques = 1
  while (Date.now() - inicio < 60000) {
    const corpo = await page.locator('body').innerText().catch(() => '')
    if (/DADOS DO PROCESSO/i.test(corpo)) return { status: 'ok', texto: corpo }
    if (/(protocolo|senha)[^.\n]*(inv[áa]lid|incorret|n[ãa]o confere)/i.test(corpo) ||
        /processo n[ãa]o (encontrado|localizado)/i.test(corpo)) {
      const dump = debug ? await dumpSuspensao(page, `naoenc-${protocolo}`) : null
      return { status: 'nao-encontrado', texto: corpo.replace(/\s+/g, ' ').slice(0, 300), dump }
    }
    if (SEL.limiteConsultas.test(corpo)) return { status: 'limite', texto: '' }
    if (Date.now() - ultimoClique > 15000 && cliques < 3) {
      cliques++
      log(`sem desfecho em 15s — re-clicando ACESSAR (clique ${cliques}/3)`)
      await botao.click({ timeout: 3000 }).catch(() => botao.evaluate(el => el.click()).catch(() => {}))
      ultimoClique = Date.now()
    }
    await page.waitForTimeout(1000)
  }
  const dump = debug ? await dumpSuspensao(page, `timeout-${protocolo}`) : null
  const texto = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 400)
  return { status: 'erro', texto, dump }
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
