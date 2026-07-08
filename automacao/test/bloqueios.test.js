const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const B = require('../bloqueios.js')

function tmpArq() {
  return path.join(os.tmpdir(), `bloq-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
}

test('arquivo inexistente → conjunto vazio', () => {
  const arq = tmpArq()
  const b = B.carregar(arq)
  assert.strictEqual(b.estaBloqueada('p1'), false)
  assert.deepStrictEqual(b.lista(), [])
})

test('bloquear persiste e reflete em nova carga', () => {
  const arq = tmpArq()
  const b = B.carregar(arq)
  b.bloquear('p1', { placa: 'ABC1D23', motivo: 'protegido' })
  assert.ok(b.estaBloqueada('p1'))

  const b2 = B.carregar(arq)
  assert.ok(b2.estaBloqueada('p1'))
  assert.strictEqual(b2.lista()[0].placa, 'ABC1D23')
  assert.match(b2.lista()[0].em, /^\d{4}-\d{2}-\d{2}/)
  fs.unlinkSync(arq)
})

test('bloquear é idempotente (não duplica)', () => {
  const arq = tmpArq()
  const b = B.carregar(arq)
  b.bloquear('p1', { placa: 'ABC1D23', motivo: 'protegido' })
  b.bloquear('p1', { placa: 'ABC1D23', motivo: 'protegido' })
  assert.strictEqual(b.lista().length, 1)
  fs.unlinkSync(arq)
})
