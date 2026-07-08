const { test } = require('node:test')
const assert = require('node:assert')
const M = require('../mapeamento.js')

test('mapResultado cobre os 5 resultados do site', () => {
  assert.deepStrictEqual(M.mapResultado('Indeferido'), { status: 'Indeferido', precisaDataLimite: true })
  assert.deepStrictEqual(M.mapResultado('Não conhecido'), { status: 'Indeferido', precisaDataLimite: true })
  assert.deepStrictEqual(M.mapResultado('Deferido'), { status: 'Deferido', precisaDataLimite: false })
  assert.deepStrictEqual(M.mapResultado('Cadastrado sem decisão'), { status: 'Aguardando', precisaDataLimite: false })
  assert.deepStrictEqual(M.mapResultado('Efeito Suspensivo'), { status: 'Aguardando', precisaDataLimite: false })
})

test('mapResultado tolera caixa e espaços', () => {
  assert.strictEqual(M.mapResultado('  INDEFERIDO ').status, 'Indeferido')
  assert.strictEqual(M.mapResultado('efeito suspensivo').status, 'Aguardando')
})

test('mapResultado aceita texto real do site (prefixo "Processo")', () => {
  assert.strictEqual(M.mapResultado('Processo Cadastrado sem decisão').status, 'Aguardando')
  assert.strictEqual(M.mapResultado('Processo Indeferido').status, 'Indeferido')
  assert.strictEqual(M.mapResultado('Processo Deferido').status, 'Deferido')
  assert.strictEqual(M.mapResultado('Processo Não conhecido').status, 'Indeferido')
})

test('mapResultado não confunde Indeferido com Deferido', () => {
  assert.strictEqual(M.mapResultado('Processo Indeferido').status, 'Indeferido')
  assert.strictEqual(M.mapResultado('INDEFERIDO').status, 'Indeferido')
})

test('mapResultado retorna null para texto desconhecido', () => {
  assert.strictEqual(M.mapResultado('Em análise pelo órgão'), null)
  assert.strictEqual(M.mapResultado(''), null)
  assert.strictEqual(M.mapResultado(null), null)
})

test('contemCodigo ignora espaços e caixa (site insere espaço no código)', () => {
  assert.ok(M.contemCodigo('Identificador do AutoUF:SP-126200-1V 5379787-7455-0', '1V5379787'))
  assert.ok(M.contemCodigo('UF:RD-000100-R855283197-7455Vencimento 11/07/2025', 'R855283197'))
  assert.ok(M.contemCodigo('numero n004330074 aqui', 'N004330074'))
  assert.ok(!M.contemCodigo('UF:RD-000100-R855283197-7455', 'N004330074'))
  assert.ok(!M.contemCodigo('qualquer texto', ''))
})

test('limparPlaca remove sufixo /UF e separadores (cadastro guarda "QJC8G88/SC")', () => {
  assert.strictEqual(M.limparPlaca('QJC8G88/SC'), 'QJC8G88')
  assert.strictEqual(M.limparPlaca(' mjl0h67 '), 'MJL0H67')
  assert.strictEqual(M.limparPlaca('ABC-1234'), 'ABC1234')
  assert.strictEqual(M.limparPlaca('RYT0A74/PR'), 'RYT0A74')
})

test('limparRenavam mantém só dígitos', () => {
  assert.strictEqual(M.limparRenavam('489968520'), '489968520')
  assert.strictEqual(M.limparRenavam('1.390.381.657'), '1390381657')
  assert.strictEqual(M.limparRenavam(489968520), '489968520')
})

test('placaValida aceita formatos antigo e Mercosul (após limpeza)', () => {
  assert.ok(M.placaValida('MJL0H67'))
  assert.ok(M.placaValida('ABC1234'))
  assert.ok(M.placaValida('QJC8G88/SC'))
  assert.ok(M.placaValida(' ryt0a74 '))
})

test('placaValida rejeita lixo do cadastro', () => {
  assert.ok(!M.placaValida('TOXICOLOGICO'))
  assert.ok(!M.placaValida('ABC12'))
  assert.ok(!M.placaValida(''))
  assert.ok(!M.placaValida(null))
})

test('renavamValido aceita 9 a 11 dígitos (após limpeza)', () => {
  assert.ok(M.renavamValido('489968520'))
  assert.ok(M.renavamValido(1390381657))
  assert.ok(M.renavamValido('1.390.381.657'))
  assert.ok(!M.renavamValido('12345'))
  assert.ok(!M.renavamValido('sem renavam'))
  assert.ok(!M.renavamValido(null))
})

test('parseDataBR converte dd/mm/aaaa para aaaa-mm-dd', () => {
  assert.strictEqual(M.parseDataBR('19/08/2026'), '2026-08-19')
  assert.strictEqual(M.parseDataBR('5/3/2026'), '2026-03-05')
  assert.strictEqual(M.parseDataBR('data inválida'), null)
  assert.strictEqual(M.parseDataBR(null), null)
})

test('montarUpdate: indeferido na JARI grava jari, vencimento e ultima_att', () => {
  const ait = { codigo: 'N004330074', defesa_previa: 'Indeferido', jari: 'Aguardando', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'jari', resultado: 'Indeferido', dataLimite: '2026-08-19' }])
  assert.strictEqual(up.jari, 'Indeferido')
  assert.strictEqual(up.vencimento, '2026-08-19')
  assert.strictEqual(up.ultima_att, M.hoje())
  assert.strictEqual(up.encerrado, undefined)
})

test('montarUpdate: deferido encerra a AIT', () => {
  const ait = { codigo: 'X', defesa_previa: 'Indeferido', jari: 'Aguardando', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'jari', resultado: 'Deferido', dataLimite: null }])
  assert.strictEqual(up.jari, 'Deferido')
  assert.strictEqual(up.encerrado, true)
})

test('montarUpdate: indeferido na 2a instancia encerra (fim da linha)', () => {
  const ait = { codigo: 'X', defesa_previa: 'Indeferido', jari: 'Indeferido', segunda_instancia: 'Aguardando', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'segunda_instancia', resultado: 'Indeferido', dataLimite: null }])
  assert.strictEqual(up.segunda_instancia, 'Indeferido')
  assert.strictEqual(up.encerrado, true)
})

test('montarUpdate: site prevalece sobre workspace desatualizado', () => {
  // workspace acha que está em defesa prévia; site mostra decisão na defesa E jari cadastrado
  const ait = { codigo: 'X', defesa_previa: 'Aguardando', jari: '', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [
    { instancia: 'defesa_previa', resultado: 'Indeferido', dataLimite: null },
    { instancia: 'jari', resultado: 'Cadastrado sem decisão', dataLimite: null }
  ])
  assert.strictEqual(up.defesa_previa, 'Indeferido')
  assert.strictEqual(up.jari, 'Aguardando')
})

test('montarUpdate: nada encontrado no site → só ultima_att', () => {
  const ait = { codigo: 'X', defesa_previa: 'Aguardando', jari: '', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [])
  assert.deepStrictEqual(Object.keys(up), ['ultima_att'])
})

test('montarUpdate: resultado desconhecido no site é ignorado (vira só ultima_att)', () => {
  const ait = { codigo: 'X', defesa_previa: 'Aguardando', jari: '', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'defesa_previa', resultado: 'Texto novo do site', dataLimite: null }])
  assert.deepStrictEqual(Object.keys(up), ['ultima_att'])
})
