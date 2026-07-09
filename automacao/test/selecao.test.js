const { test } = require('node:test')
const assert = require('node:assert')
const Sel = require('../selecao.js')

const clientes = [
  { id: 'c1', nome: 'ADRIANO KALFELS' },
  { id: 'c2', nome: 'João Nicácio da Cunha' },
  { id: 'c3', nome: 'MARCIO FELIPE CUSTODIO' }
]
const placas = [
  { id: 'p1', cliente_id: 'c1', placa: 'MEI4879/SC' },
  { id: 'p2', cliente_id: 'c2', placa: 'LZK4066/SC' },
  { id: 'p3', cliente_id: 'c3', placa: 'RLA7G64' }
]

test('buscarClientes: parcial, sem caixa e sem acento', () => {
  assert.deepStrictEqual(Sel.buscarClientes(clientes, 'adriano').map(c => c.id), ['c1'])
  assert.deepStrictEqual(Sel.buscarClientes(clientes, 'nicacio').map(c => c.id), ['c2'])
  assert.deepStrictEqual(Sel.buscarClientes(clientes, 'JOÃO').map(c => c.id), ['c2'])
  assert.strictEqual(Sel.buscarClientes(clientes, 'inexistente').length, 0)
  assert.strictEqual(Sel.buscarClientes(clientes, '  ').length, 0)
})

test('buscarPlacas: parcial, ignora /UF e separadores', () => {
  assert.deepStrictEqual(Sel.buscarPlacas(placas, 'MEI4879').map(p => p.id), ['p1'])
  assert.deepStrictEqual(Sel.buscarPlacas(placas, 'mei4879/sc').map(p => p.id), ['p1'])
  assert.deepStrictEqual(Sel.buscarPlacas(placas, 'LZK').map(p => p.id), ['p2'])
  assert.strictEqual(Sel.buscarPlacas(placas, 'ZZZ9Z99').length, 0)
})

test('placasDoCliente devolve só as placas dele', () => {
  assert.deepStrictEqual(Sel.placasDoCliente(placas, 'c1').map(p => p.id), ['p1'])
  assert.strictEqual(Sel.placasDoCliente(placas, 'c9').length, 0)
})
