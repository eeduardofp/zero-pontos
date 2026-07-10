// ─── SUSPENSÕES: parser da tela + regras de atualização ──────
// Textos de teste transcritos dos prints reais do serviço de suspensão
// (https://servicos.detran.sc.gov.br/habilitacao?consultarProcessoSuspensao=true)
const { test } = require('node:test')
const assert = require('node:assert')
const MS = require('../mapeamentoSuspensoes.js')

// ── parseTelaSuspensao ────────────────────────────────────────
const TELA_JARI = `DADOS DO PROCESSO ADICIONAR ÀS SOLICITAÇÕES
PROCESSO DE SUSPENSÃO DO DIREITO DE DIRIGIR
Número: 35706/2025 CIRETRAN: JOINVILLE
FASE: AGUARDANDO JULGAMENTO JARI
Instaurado em: 17/10/2025 Motivo: Pontuação
Sem Bloqueio Ativado no RENACH.
PRAZO LIMITE PARA DEFESA 10/07/2026 ENVIAR DOCUMENTO
COMPROVANTE DEFESA/RECURSO CADASTRAR E-MAIL`

const TELA_CETRAN = `DADOS DO PROCESSO ADICIONAR ÀS SOLICITAÇÕES
PROCESSO DE SUSPENSÃO DO DIREITO DE DIRIGIR
Número: 155466/2023 CIRETRAN: JOINVILLE
FASE: AGUARDANDO JULGAMENTO CETRAN
Instaurado em: 27/01/2023 Motivo: Infração Suspensiva
PRAZO LIMITE PARA DEFESA 30/07/2026 ENVIAR DOCUMENTO`

const TELA_DEFESA = `DADOS DO PROCESSO ADICIONAR ÀS SOLICITAÇÕES
PROCESSO DE SUSPENSÃO DO DIREITO DE DIRIGIR
Número: 17643/2026 CIRETRAN: JOINVILLE (DETRAN)
FASE: AGUARDANDO JULGAMENTO DEFESA
Instaurado em: 30/03/2026 Motivo: Infração Suspensiva
Prazo limite para defesa: 03/06/2026
Sem Bloqueio Ativado no RENACH.`

test('parseTelaSuspensao extrai fase JARI, número e prazo', () => {
  const t = MS.parseTelaSuspensao(TELA_JARI)
  assert.strictEqual(t.fase, 'jari')
  assert.strictEqual(t.numero, '35706/2025')
  assert.strictEqual(t.prazo, '2026-07-10')
})

test('parseTelaSuspensao extrai fase CETRAN', () => {
  const t = MS.parseTelaSuspensao(TELA_CETRAN)
  assert.strictEqual(t.fase, 'cetran')
  assert.strictEqual(t.numero, '155466/2023')
  assert.strictEqual(t.prazo, '2026-07-30')
})

test('parseTelaSuspensao extrai fase DEFESA (prazo em minúsculas com dois-pontos)', () => {
  const t = MS.parseTelaSuspensao(TELA_DEFESA)
  assert.strictEqual(t.fase, 'defesa')
  assert.strictEqual(t.numero, '17643/2026')
  assert.strictEqual(t.prazo, '2026-06-03')
})

test('parseTelaSuspensao: fase desconhecida → fase null (não inventa)', () => {
  const t = MS.parseTelaSuspensao('DADOS DO PROCESSO Número: 1/2026 FASE: JULGADO PELA JARI')
  assert.strictEqual(t.fase, null)
  assert.strictEqual(t.numero, '1/2026')
})

test('parseTelaSuspensao: texto sem tela de processo → null', () => {
  assert.strictEqual(MS.parseTelaSuspensao('qualquer outra página do site'), null)
  assert.strictEqual(MS.parseTelaSuspensao(''), null)
})

// ── montarUpdateSuspensao ─────────────────────────────────────
const sus = (dp, jari, cetran, extra = {}) => ({
  defesa_previa: dp, jari, cetran,
  vencimento_jari: null, vencimento_cetran: null, ...extra
})

test('fase JARI: cascateia DP=Indeferido e grava vencimento_jari', () => {
  const up = MS.montarUpdateSuspensao(
    sus('Aguardando', null, null),
    { fase: 'jari', prazo: '2026-07-10' }
  )
  assert.strictEqual(up.defesa_previa, 'Indeferido')
  assert.strictEqual(up.vencimento_jari, '2026-07-10')
  assert.ok(up.ultima_att)
  assert.ok(!('jari' in up))            // não mexe no campo da própria fase
  assert.ok(!('vencimento_cetran' in up))
})

test('fase JARI: DP já Indeferido → só vencimento', () => {
  const up = MS.montarUpdateSuspensao(
    sus('Indeferido', 'Aguardando', null),
    { fase: 'jari', prazo: '2026-07-10' }
  )
  assert.ok(!('defesa_previa' in up))
  assert.strictEqual(up.vencimento_jari, '2026-07-10')
})

test('fase JARI: DP "Não realizado" é estado válido — não sobrescreve', () => {
  const up = MS.montarUpdateSuspensao(
    sus('Não realizado', null, null),
    { fase: 'jari', prazo: '2026-07-10' }
  )
  assert.ok(!('defesa_previa' in up))
  assert.strictEqual(up.vencimento_jari, '2026-07-10')
})

test('fase JARI: vencimento igual ao já gravado → não regrava', () => {
  const up = MS.montarUpdateSuspensao(
    sus('Indeferido', 'Aguardando', null, { vencimento_jari: '2026-07-10' }),
    { fase: 'jari', prazo: '2026-07-10' }
  )
  assert.ok(!('vencimento_jari' in up))
})

test('fase CETRAN: cascateia DP e JARI para Indeferido e grava vencimento_cetran', () => {
  const up = MS.montarUpdateSuspensao(
    sus('Aguardando', 'Aguardando', null),
    { fase: 'cetran', prazo: '2026-07-30' }
  )
  assert.strictEqual(up.defesa_previa, 'Indeferido')
  assert.strictEqual(up.jari, 'Indeferido')
  assert.strictEqual(up.vencimento_cetran, '2026-07-30')
  assert.ok(!('cetran' in up))
})

test('fase CETRAN: JARI Deferido nunca é rebaixado', () => {
  const up = MS.montarUpdateSuspensao(
    sus('Indeferido', 'Deferido', null),
    { fase: 'cetran', prazo: '2026-07-30' }
  )
  assert.ok(!('jari' in up))
  assert.strictEqual(up.vencimento_cetran, '2026-07-30')
})

test('fase DEFESA: nada muda além de ultima_att', () => {
  const up = MS.montarUpdateSuspensao(
    sus('Aguardando', null, null),
    { fase: 'defesa', prazo: '2026-06-03' }
  )
  assert.deepStrictEqual(Object.keys(up), ['ultima_att'])
})

test('fase desconhecida: nada muda além de ultima_att', () => {
  const up = MS.montarUpdateSuspensao(
    sus('Aguardando', null, null),
    { fase: null, prazo: null }
  )
  assert.deepStrictEqual(Object.keys(up), ['ultima_att'])
})
