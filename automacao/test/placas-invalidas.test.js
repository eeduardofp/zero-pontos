// ─── PLACAS INVÁLIDAS: lista dedicada de placa/renavam ruins ────
const { test } = require('node:test')
const assert = require('node:assert')
const PI = require('../placasInvalidas.js')

test('gerarCSV: cabeçalho e linhas com cliente, placa, renavam, motivo', () => {
  const csv = PI.gerarCSV([
    { cliente: 'JOÃO SILVA', placa: 'TOXICOLOGICO', renavam: '—', motivo: 'placa inválida ("TOXICOLOGICO")' },
    { cliente: 'MARIA SOUZA', placa: 'ABC1D23', renavam: '', motivo: 'renavam ausente/inválido ("")' }
  ])
  const linhas = csv.split('\n')
  assert.strictEqual(linhas[0], 'cliente,placa,renavam,motivo')
  assert.strictEqual(linhas.length, 3)
  assert.ok(linhas[1].includes('JOÃO SILVA'))
  assert.ok(linhas[1].includes('TOXICOLOGICO'))
})

test('gerarCSV: escapa vírgula e aspas no motivo', () => {
  const csv = PI.gerarCSV([
    { cliente: 'A, B', placa: 'X', renavam: '1', motivo: 'placa e renavam inválidos, "confira"' }
  ])
  assert.ok(csv.includes('"A, B"'))
  assert.ok(csv.includes('"placa e renavam inválidos, ""confira"""'))
})

test('gerarCSV: lista vazia gera só o cabeçalho', () => {
  assert.strictEqual(PI.gerarCSV([]), 'cliente,placa,renavam,motivo')
})
