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

test('nucleoCodigo extrai o miolo do identificador', () => {
  assert.strictEqual(M.nucleoCodigo('UF:RD-000100-R855283197-7455-0'), 'R855283197')
  assert.strictEqual(M.nucleoCodigo('JOINVILLE-008805-JL01206597-7455-0'), 'JL01206597')
  assert.strictEqual(M.nucleoCodigo('UF:SP-126200- 1V 0420707-7455-0'), '1V0420707')
  assert.strictEqual(M.nucleoCodigo('114100-VSV0597959-7455-0'), 'VSV0597959')
  // sem estrutura de segmentos → usa o código inteiro normalizado
  assert.strictEqual(M.nucleoCodigo('N004330074'), 'N004330074')
})

test('contemCodigo casa débito TRUNCADO pelo núcleo (bug do vencimento)', () => {
  // débito corta o dígito final e abrevia o prefixo — substring integral falha
  assert.ok(M.contemCodigo('UF:RD-000100-R855283197-7455Vencimento 11/07/2025', 'UF:RD-000100-R855283197-7455-0'))
  assert.ok(M.contemCodigo('JOINVIL-008805-JL01206597-7455Vencimento 24/03/2025', 'JOINVILLE-008805-JL01206597-7455-0'))
  assert.ok(M.contemCodigo('UF:SP-126200-1V 5379787-7455Vencimento 20/10/2025', 'UF:SP-126200- 1V 5379787 -7455-0'))
  // núcleo diferente → não casa
  assert.ok(!M.contemCodigo('UF:RD-000100-R855283197-7455', 'UF:RD-000100-J001658782-7455-0'))
})

test('contemCodigo ignora espaços e caixa (site insere espaço no código)', () => {
  assert.ok(M.contemCodigo('Identificador do AutoUF:SP-126200-1V 5379787-7455-0', '1V5379787'))
  assert.ok(M.contemCodigo('UF:RD-000100-R855283197-7455Vencimento 11/07/2025', 'R855283197'))
  assert.ok(M.contemCodigo('numero n004330074 aqui', 'N004330074'))
  assert.ok(!M.contemCodigo('UF:RD-000100-R855283197-7455', 'N004330074'))
  assert.ok(!M.contemCodigo('qualquer texto', ''))
})

// Casamento pelos últimos 7 dígitos do núcleo: o espaço que o site insere no
// código sempre cai depois dos 2 primeiros caracteres do núcleo, então o final
// nunca é cortado — usar só o final é mais robusto que exigir o núcleo inteiro
// (tolera truncamentos do site que a gente ainda não calibrou em fixture).
test('contemCodigo casa pelos últimos 7 dígitos mesmo com o começo do núcleo diferente/cortado', () => {
  // site retorna só o final do núcleo (truncamento não calibrado) — ainda casa
  assert.ok(M.contemCodigo('texto com 5283197 no meio', 'UF:RD-000100-R855283197-7455-0'))
  assert.ok(M.contemCodigo('debito JL01206597 aqui', 'JOINVILLE-008805-JL01206597-7455-0'))
})

test('contemCodigo NÃO casa por coincidência de sufixo curto (exige núcleo com pelo menos 6 chars)', () => {
  assert.ok(!M.contemCodigo('nada relevante aqui', 'AB1'))
})

test('contemCodigo: risco aceito — núcleos diferentes que só coincidem no final de 7 dígitos casam entre si (2 casos em 942 núcleos reais: H004401021/Z4401021 e H4285771/Z004285771)', () => {
  // trade-off consciente: usar só o final é mais robusto a truncamento do site
  // do que exigir o núcleo inteiro, ao custo de colisões raríssimas como esta.
  assert.ok(M.contemCodigo('processo Z4401021 encontrado', 'H004401021'))
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

test('montarUpdate: JARI existente força DP indeferida (estado impossível)', () => {
  // site mostra só card da JARI cadastrada; DP aguardando no workspace é impossível
  const ait = { codigo: 'X', defesa_previa: 'Aguardando', jari: '', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'jari', resultado: 'Cadastrado sem decisão', dataLimite: null }])
  assert.strictEqual(up.jari, 'Aguardando')
  assert.strictEqual(up.defesa_previa, 'Indeferido')
})

test('montarUpdate: cascata não mexe em DP "Não realizado"', () => {
  const ait = { codigo: 'X', defesa_previa: 'Não realizado', jari: '', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'jari', resultado: 'Cadastrado sem decisão', dataLimite: null }])
  assert.strictEqual(up.defesa_previa, undefined)
})

test('montarUpdate: 2ª instância existente força JARI indeferida', () => {
  const ait = { codigo: 'X', defesa_previa: 'Indeferido', jari: 'Aguardando', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'segunda_instancia', resultado: 'Cadastrado sem decisão', dataLimite: null }])
  assert.strictEqual(up.segunda_instancia, 'Aguardando')
  assert.strictEqual(up.jari, 'Indeferido')
})

test('montarUpdate: site não regride DP julgada para Aguardando', () => {
  // caso real: DP:Indeferido no workspace; site tem card de defesa "sem decisão"
  // + JARI aguardando — a cascata deve manter DP:Indeferido
  const ait = { codigo: 'X', defesa_previa: 'Indeferido', jari: 'Aguardando', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [
    { instancia: 'defesa_previa', resultado: 'Cadastrado sem decisão', dataLimite: null },
    { instancia: 'jari', resultado: 'Cadastrado sem decisão', dataLimite: null }
  ])
  assert.notStrictEqual(up.defesa_previa, 'Aguardando')
})

test('montarUpdate: DP indeferida abre JARI como "Não realizado" (alimenta fila de recursos)', () => {
  const ait = { codigo: 'X', defesa_previa: 'Aguardando', jari: '', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'defesa_previa', resultado: 'INDEFERIDO em 19/02/2025', dataLimite: '2025-09-12' }])
  assert.strictEqual(up.defesa_previa, 'Indeferido')
  assert.strictEqual(up.jari, 'Não realizado')
  assert.strictEqual(up.vencimento, '2025-09-12')
})

test('montarUpdate: não sobrescreve JARI já protocolada com "Não realizado"', () => {
  const ait = { codigo: 'X', defesa_previa: 'Aguardando', jari: 'Aguardando', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'defesa_previa', resultado: 'INDEFERIDO em 19/02/2025', dataLimite: null }])
  assert.strictEqual(up.defesa_previa, 'Indeferido')
  assert.strictEqual(up.jari, undefined)
})

test('montarUpdate: JARI recém-indeferida (era Aguardando) abre 2ª como "Não realizado"', () => {
  // programa mudou a JARI agora → a 2ª ainda não foi feita → vai pra fila
  const ait = { codigo: 'X', defesa_previa: 'Indeferido', jari: 'Aguardando', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'jari', resultado: 'INDEFERIDO em 06/04/2026', dataLimite: '2026-06-03' }])
  assert.strictEqual(up.jari, 'Indeferido')
  assert.strictEqual(up.segunda_instancia, 'Não realizado')
  assert.strictEqual(up.vencimento, '2026-06-03')
  assert.strictEqual(up.encerrado, undefined)
})

test('montarUpdate: JARI já indeferida antes NÃO reabre a 2ª (site cego para a 2ª)', () => {
  // JARI não mudou neste run → não sabemos se a 2ª foi feita → não mexe.
  // Evita defesa fantasma quando a 2ª já foi protocolada fora do site.
  const ait = { codigo: 'X', defesa_previa: 'Indeferido', jari: 'Indeferido', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'jari', resultado: 'INDEFERIDO em 06/04/2026', dataLimite: '2026-06-03' }])
  assert.strictEqual(up.segunda_instancia, undefined)   // NÃO reabre
})

test('montarUpdate: JARI recém-indeferida não sobrescreve 2ª já "Aguardando"', () => {
  const ait = { codigo: 'X', defesa_previa: 'Indeferido', jari: 'Aguardando', segunda_instancia: 'Aguardando', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'jari', resultado: 'INDEFERIDO em 06/04/2026', dataLimite: null }])
  assert.strictEqual(up.jari, 'Indeferido')
  assert.strictEqual(up.segunda_instancia, undefined)   // intocada (só abre etapa vazia)
})

test('montarUpdate: 2ª muda quando o site mostra decisão real', () => {
  const ait = { codigo: 'X', defesa_previa: 'Indeferido', jari: 'Indeferido', segunda_instancia: 'Aguardando', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'segunda_instancia', resultado: 'DEFERIDO em 06/06/2026', dataLimite: null }])
  assert.strictEqual(up.segunda_instancia, 'Deferido')
  assert.strictEqual(up.encerrado, true)
})

test('montarUpdate: cascata + abertura da 2ª (site só mostra JARI recém-indeferida)', () => {
  const ait = { codigo: 'X', defesa_previa: 'Aguardando', jari: '', segunda_instancia: '', encerrado: false }
  const up = M.montarUpdate(ait, [{ instancia: 'jari', resultado: 'INDEFERIDO em 06/04/2026', dataLimite: null }])
  assert.strictEqual(up.defesa_previa, 'Indeferido')       // cascata (DP confiável)
  assert.strictEqual(up.jari, 'Indeferido')
  assert.strictEqual(up.segunda_instancia, 'Não realizado') // JARI era vazia → abre
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
