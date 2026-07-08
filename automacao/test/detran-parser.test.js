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

test('extractDebitos: fixture sem débitos retorna vazio', async () => {
  await carregarFixture('dossie-MJL0H67.html')
  const debitos = await D.extractDebitos(page)
  assert.deepStrictEqual(debitos, [])
})

test('isPermissaoNegada é falso em dossiê normal', async () => {
  await carregarFixture('dossie-MJL0H67.html')
  assert.strictEqual(await D.isPermissaoNegada(page), false)
})
