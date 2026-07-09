// ─── COMERCIAL: garimpo de oportunidades ─────────────────────
// Débito com vencimento no ano atual, sem recurso vinculado e sem
// registro no workspace → possível venda.
const { test } = require('node:test')
const assert = require('node:assert')
const M = require('../mapeamento.js')

// ── parseValorBR ──────────────────────────────────────────────
test('parseValorBR converte moeda do site', () => {
  assert.strictEqual(M.parseValorBR('R$ 130,16'), 130.16)
  assert.strictEqual(M.parseValorBR('R$ 1.195,23 '), 1195.23)
  assert.strictEqual(M.parseValorBR(''), null)
  assert.strictEqual(M.parseValorBR('Não disponível'), null)
  assert.strictEqual(M.parseValorBR(null), null)
})

// ── mesmoCodigo ───────────────────────────────────────────────
test('mesmoCodigo casa código truncado do débito com código completo do workspace', () => {
  // Débitos abrevia prefixo e corta dígito final
  assert.ok(M.mesmoCodigo('JOINVILLE-008805-JL01206597-7455-0', 'JOINVIL-008805-JL01206597-7455'))
  assert.ok(M.mesmoCodigo('JOINVIL-008805-JL01206597-7455', 'JOINVILLE-008805-JL01206597-7455-0'))
  assert.ok(M.mesmoCodigo('1V 5379787', '1V5379787'))
  assert.ok(M.mesmoCodigo('UF:RD-000100-R855283197-7455', 'UF:RD-000100-R855283197-7455'))
})

test('mesmoCodigo não casa códigos diferentes', () => {
  assert.ok(!M.mesmoCodigo('JOINVIL-008805-JL01206597-7455', 'JOINVIL-008806-JV00151982-5452'))
  assert.ok(!M.mesmoCodigo('UF:RD-000100-R855283197-7455', 'UF:RD-000100-R879514817-7455'))
  assert.ok(!M.mesmoCodigo('', 'JOINVIL-008805-JL01206597-7455'))
  assert.ok(!M.mesmoCodigo(null, null))
})

// ── garimparOportunidades ─────────────────────────────────────
const deb = (codigo, data, valor) => ({ codigo, data, valor, texto: `${codigo} Vencimento Valor` })

test('garimpo: débito do ano atual sem recurso e desconhecido é oportunidade', () => {
  const ops = M.garimparOportunidades({
    debitos: [deb('UF:RD-000100-R900000001-7455', '2026-09-12', 141.71)],
    recursos: [],
    codigosConhecidos: [],
    ano: 2026
  })
  assert.strictEqual(ops.length, 1)
  assert.strictEqual(ops[0].codigo, 'UF:RD-000100-R900000001-7455')
})

test('garimpo: vencimento fora do ano atual não é oportunidade', () => {
  const ops = M.garimparOportunidades({
    debitos: [deb('UF:RD-000100-R900000001-7455', '2025-09-12', 141.71)],
    recursos: [], codigosConhecidos: [], ano: 2026
  })
  assert.deepStrictEqual(ops, [])
})

test('garimpo: débito com recurso de infração vinculado não é oportunidade', () => {
  const ops = M.garimparOportunidades({
    debitos: [deb('JOINVIL-008805-JL01206597-7455', '2026-03-24', 130.16)],
    recursos: [{ texto: 'Identificador do Auto JOINVILLE-008805-JL01206597-7455-0 Defesa de Autuação' }],
    codigosConhecidos: [], ano: 2026
  })
  assert.deepStrictEqual(ops, [])
})

test('garimpo: código já no workspace (mesmo truncado) não é oportunidade', () => {
  const ops = M.garimparOportunidades({
    debitos: [deb('JOINVIL-008805-JL01206597-7455', '2026-03-24', 130.16)],
    recursos: [],
    codigosConhecidos: ['JOINVILLE-008805-JL01206597-7455-0'],
    ano: 2026
  })
  assert.deepStrictEqual(ops, [])
})

test('garimpo: débito sem data ou sem código é ignorado', () => {
  const ops = M.garimparOportunidades({
    debitos: [deb('', '2026-03-24', 130.16), deb('UF:RD-000100-R900000001-7455', null, 10)],
    recursos: [], codigosConhecidos: [], ano: 2026
  })
  assert.deepStrictEqual(ops, [])
})

test('garimpo: mesmo código repetido nos débitos vira uma oportunidade só', () => {
  const ops = M.garimparOportunidades({
    debitos: [
      deb('UF:RD-000100-R900000001-7455', '2026-09-12', 141.71),
      deb('UF:RD-000100-R900000001-7455', '2026-10-12', 141.71)
    ],
    recursos: [], codigosConhecidos: [], ano: 2026
  })
  assert.strictEqual(ops.length, 1)
})

test('garimpo: mistura — filtra só as defensáveis', () => {
  const ops = M.garimparOportunidades({
    debitos: [
      deb('JOINVIL-008805-JL01206597-7455', '2026-03-24', 130.16),  // tem recurso
      deb('JOINVIL-008806-JV00151982-5452', '2026-06-02', 195.23),  // já no workspace
      deb('UF:RD-000100-R855283197-7455', '2025-07-11', 137.31),    // ano passado
      deb('UF:RD-000100-R900000001-7455', '2026-09-12', 141.71)     // oportunidade!
    ],
    recursos: [{ texto: 'Auto JOINVILLE-008805-JL01206597-7455-0 Defesa' }],
    codigosConhecidos: ['JOINVILLE-008806-JV00151982-5452-1'],
    ano: 2026
  })
  assert.strictEqual(ops.length, 1)
  assert.strictEqual(ops[0].codigo, 'UF:RD-000100-R900000001-7455')
  assert.strictEqual(ops[0].valor, 141.71)
  assert.strictEqual(ops[0].data, '2026-09-12')
})
