// ─── DETRAN ──────────────────────────────────────────────────
// Extração de dados do dossiê do veículo (Detran Digital SC).
// Seletores calibrados pelas fixtures capturadas na Etapa 0 (captura.js).
// Estrutura real: seções em accordions (.accordion), cards em
// .box-destaque.lista-dados com pares .lista-dados__item--title / <p>.
const M = require('./mapeamento.js')

const SEL = {
  accordion: '.accordion',
  accordionTitulo: '.accordion-header__title',
  accordionHeader: '.accordion-header',
  card: '.box-destaque.lista-dados',
  item: '.lista-dados__item',
  itemTitulo: '.lista-dados__item--title',
  paginacao: '.paginacao',
  // PROVISÓRIO: sem fixture de erro de permissão ainda — calibrar quando capturada
  erroPermissao: /não possui permissão|sem permissão|não autorizado|não tem acesso/i,
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
        resultado: campos['Resultado do Processo'] || '',
        texto: card.textContent.replace(/\s+/g, ' ')
      }
    }), SEL
  ).then(cards => cards.map(c => ({ ...c, instancia: instanciaDoProcesso(c.processo) })))
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

module.exports = { extractRecursos, extractDebitos, isPermissaoNegada, instanciaDoProcesso, SEL }
