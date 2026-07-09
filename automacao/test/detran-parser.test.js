const { test, before, after } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')
const D = require('../detran.js')

let browser, page

before(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  page = await browser.newPage()
})
after(async () => { await browser.close() })

async function carregarFixture(nome) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'fixtures', nome), 'utf8')
  await page.setContent(html)
}

test('instanciaDoProcesso mapeia tipos de processo para campos da AIT', () => {
  assert.strictEqual(D.instanciaDoProcesso('Defesa de Autuação 123/2026'), 'defesa_previa')
  assert.strictEqual(D.instanciaDoProcesso('Defesa Prévia 9/2025'), 'defesa_previa')
  assert.strictEqual(D.instanciaDoProcesso('JARI 55/2026'), 'jari')
  assert.strictEqual(D.instanciaDoProcesso('Recurso JARI'), 'jari')
  assert.strictEqual(D.instanciaDoProcesso('CETRAN 7/2026'), 'segunda_instancia')
  assert.strictEqual(D.instanciaDoProcesso('2ª Instância 1/2026'), 'segunda_instancia')
  // tipos que não são recurso de infração da nossa esteira → ignorar
  assert.strictEqual(D.instanciaDoProcesso('Indicação Condutor 4185/2013'), null)
})

test('extractRecursos extrai cards da fixture MJL0H67', async () => {
  await carregarFixture('dossie-MJL0H67.html')
  const cards = await D.extractRecursos(page)
  assert.strictEqual(cards.length, 1)
  const c = cards[0]
  assert.strictEqual(c.processo, 'Indicação Condutor 4185/2013')
  assert.strictEqual(c.instancia, null) // Indicação Condutor não é etapa da esteira
  assert.match(c.resultado, /Cadastrado sem decisão/)
  assert.ok(c.texto.includes('UF:RD-000100-R247576287-7455-0'))
})

test('extractRecursos na fixture RYT0A74 (última página da paginação)', async () => {
  await carregarFixture('dossie-RYT0A74.html')
  const cards = await D.extractRecursos(page)
  assert.strictEqual(cards.length, 2)
  assert.strictEqual(cards[0].instancia, 'defesa_previa')
  assert.match(cards[0].resultado, /INDEFERIDO em 16\/08\/2024/)
  assert.strictEqual(cards[0].dataRequerimento, '2024-08-02')
  assert.strictEqual(cards[1].instancia, 'jari')
  assert.strictEqual(cards[1].dataRequerimento, '2024-08-02')
})

test('extractDebitos na fixture RYT0A74: 9 débitos com data ISO', async () => {
  await carregarFixture('dossie-RYT0A74.html')
  const deb = await D.extractDebitos(page)
  assert.strictEqual(deb.length, 9)
  for (const d of deb) assert.match(d.data, /^\d{4}-\d{2}-\d{2}$/)
  const M = require('../mapeamento.js')
  const alvo = deb.find(d => M.contemCodigo(d.texto, '1V5379787'))
  assert.ok(alvo, 'débito de código com espaço deve casar após normalização')
  assert.strictEqual(alvo.data, '2025-10-20')
})

test('extractDebitos extrai código e valor estruturados (garimpo comercial)', async () => {
  await carregarFixture('dossie-RYT0A74.html')
  const deb = await D.extractDebitos(page)
  const d = deb.find(x => x.codigo === 'JOINVIL-008805-JL01206597-7455')
  assert.ok(d, 'débito deve expor o código do auto')
  assert.strictEqual(d.data, '2025-03-24')
  assert.strictEqual(d.valor, 130.16)
  // todos os débitos da fixture têm código e valor
  for (const x of deb) {
    assert.ok(x.codigo.length >= 6, `código vazio em: ${x.texto.slice(0, 40)}`)
    assert.ok(typeof x.valor === 'number', `valor ausente em: ${x.texto.slice(0, 40)}`)
  }
})

test('extractInfracoes na fixture RYT0A74: cards com número, descrição, valor e prazo', async () => {
  await carregarFixture('dossie-RYT0A74.html')
  const inf = await D.extractInfracoes(page)
  assert.strictEqual(inf.length, 5)   // página 1 de 3
  const alvo = inf.find(i => i.numeroAuto === 'JL01206597')
  assert.ok(alvo)
  assert.strictEqual(alvo.descricao, 'TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%')
  assert.strictEqual(alvo.valorMulta, 130.16)
  assert.strictEqual(alvo.limiteDefesa, '2024-12-16')
  const grave = inf.find(i => i.numeroAuto === 'JV00151982')
  assert.strictEqual(grave.descricao, 'ESTACIONAR NO PASSEIO')
  assert.strictEqual(grave.valorMulta, 195.23)
})

test('extractInfracoes não confunde com RECURSOS DE INFRAÇÃO', async () => {
  await carregarFixture('dossie-MJL0H67.html')
  const inf = await D.extractInfracoes(page)
  // fixture MJL0H67: se houver aba INFRAÇÕES, nenhum card deve ter campo "Processo"
  for (const i of inf) assert.ok(i.numeroAuto !== undefined)
})

test('extractDebitos: fixture sem débitos retorna vazio', async () => {
  await carregarFixture('dossie-MJL0H67.html')
  const debitos = await D.extractDebitos(page)
  assert.deepStrictEqual(debitos, [])
})

test('isPermissaoNegada detecta veículo protegido (fixture real)', async () => {
  await carregarFixture('dossie-MKK3J84-protegido.html')
  assert.strictEqual(await D.isPermissaoNegada(page), true)
})

test('isPermissaoNegada é falso em dossiê normal', async () => {
  await carregarFixture('dossie-MJL0H67.html')
  assert.strictEqual(await D.isPermissaoNegada(page), false)
})
