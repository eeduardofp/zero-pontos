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
