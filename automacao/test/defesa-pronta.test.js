const test = require('node:test')
const assert = require('node:assert')
const DefesaPronta = require('../../defesa-pronta.js')

test('estado: nunca marcada (null) é pendente', () => {
  assert.strictEqual(DefesaPronta.estado(null, 'JARI'), 'pendente')
  assert.strictEqual(DefesaPronta.estado(undefined, 'JARI'), 'pendente')
  assert.strictEqual(DefesaPronta.estado('', 'JARI'), 'pendente')
})

test('estado: marcada para a etapa atual é pronta', () => {
  assert.strictEqual(DefesaPronta.estado('JARI', 'JARI'), 'pronta')
  assert.strictEqual(DefesaPronta.estado('2ª Instância', '2ª Instância'), 'pronta')
  assert.strictEqual(DefesaPronta.estado('CETRAN', 'CETRAN'), 'pronta')
})

test('estado: marcada para etapa anterior volta a pendente ao avançar', () => {
  assert.strictEqual(DefesaPronta.estado('Defesa Prévia', 'JARI'), 'pendente')
  assert.strictEqual(DefesaPronta.estado('JARI', '2ª Instância'), 'pendente')
})

test('estado: sem próxima etapa nunca é pronta', () => {
  assert.strictEqual(DefesaPronta.estado('JARI', null), 'pendente')
})

test('contar: totaliza prontas e pendentes', () => {
  const itens = [
    { marcada: 'JARI', prox: 'JARI' },
    { marcada: null, prox: 'JARI' },
    { marcada: 'Defesa Prévia', prox: 'JARI' },
    { marcada: 'CETRAN', prox: 'CETRAN' },
  ]
  assert.deepStrictEqual(DefesaPronta.contar(itens), { prontas: 2, pendentes: 2 })
})

test('contar: lista vazia', () => {
  assert.deepStrictEqual(DefesaPronta.contar([]), { prontas: 0, pendentes: 0 })
})

test('tagHtml: pronta gera tag verde com texto Pronta e ação de alternar', () => {
  const h = DefesaPronta.tagHtml('suspensao', 's0051', 'JARI', 'JARI')
  assert.ok(h.includes('tag-defesa ok'))
  assert.ok(h.includes('>Pronta<'))
  assert.ok(h.includes("toggleDefesaPronta('suspensao','s0051')"))
  assert.ok(h.includes('aria-label="Defesa pronta.'))
})

test('tagHtml: pendente gera tag cinza com texto Pendente', () => {
  const h = DefesaPronta.tagHtml('ait', 'abc123', null, 'JARI')
  assert.ok(h.includes('tag-defesa no'))
  assert.ok(h.includes('>Pendente<'))
  assert.ok(h.includes("toggleDefesaPronta('ait','abc123')"))
})

test('tagHtml: marcação de etapa antiga aparece como pendente', () => {
  const h = DefesaPronta.tagHtml('ait', 'abc123', 'Defesa Prévia', 'JARI')
  assert.ok(h.includes('tag-defesa no'))
})

test('tagHtml: teclado Enter e Espaço acionam o mesmo toggle', () => {
  const h = DefesaPronta.tagHtml('ait', 'x1', null, 'JARI')
  assert.ok(h.includes("onkeydown=\"if(event.key==='Enter'||event.key===' ')"))
})
