// ─── MAPEAMENTO SUSPENSÕES ───────────────────────────────────
// Regras puras: tela "DADOS DO PROCESSO" do serviço de suspensão de CNH
// (/habilitacao?consultarProcessoSuspensao=true) → campos da suspensão
// no workspace. Sem I/O — tudo testável.
//
// Nesta versão só as fases "AGUARDANDO JULGAMENTO ..." são tratadas
// (decisão com o Eduardo em 2026-07-09); fases julgadas (deferido/
// indeferido) seguem manuais até capturarmos exemplos reais delas.
const M = require('./mapeamento.js')

const REGRA_FASE = [
  { re: /AGUARDANDO JULGAMENTO (DA )?DEFESA/i, fase: 'defesa' },
  { re: /AGUARDANDO JULGAMENTO (DA )?JARI/i, fase: 'jari' },
  { re: /AGUARDANDO JULGAMENTO (DO )?CETRAN/i, fase: 'cetran' }
]

// Texto visível da página → { fase: 'defesa'|'jari'|'cetran'|null,
//                             numero, prazo: 'aaaa-mm-dd'|null }
// Retorna null se o texto não é a tela de processo (não parseia lixo).
function parseTelaSuspensao(texto) {
  const t = (texto || '').replace(/\s+/g, ' ')
  if (!/DADOS DO PROCESSO|PROCESSO DE SUSPENS/i.test(t)) return null
  const regra = REGRA_FASE.find(r => r.re.test(t))
  const numero = (/N[úu]mero:\s*([0-9]+\/[0-9]{4})/i.exec(t) || [])[1] || null
  const prazoBr = (/PRAZO LIMITE PARA DEFESA:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(t) || [])[1] || ''
  return { fase: regra ? regra.fase : null, numero, prazo: M.parseDataBR(prazoBr) }
}

// A fase do site implica que as etapas anteriores foram vencidas:
// FASE=JARI → DP indeferida; FASE=CETRAN → DP e JARI indeferidas.
// Só avança etapa vazia ou "Aguardando" — "Não realizado" é estado válido
// (nunca protocolamos) e "Deferido"/"Indeferido" são julgamentos que não
// podem ser sobrescritos por inferência.
// O prazo do site vai no vencimento da fase corrente (campo onde a aba
// Suspensões do workspace espera a data-limite para protocolar).
function montarUpdateSuspensao(s, tela) {
  const fields = {}
  const avanca = v => !v || v === 'Aguardando'
  if (tela.fase === 'jari') {
    if (avanca(s.defesa_previa)) fields.defesa_previa = 'Indeferido'
    if (tela.prazo && tela.prazo !== (s.vencimento_jari || null)) fields.vencimento_jari = tela.prazo
  }
  if (tela.fase === 'cetran') {
    if (avanca(s.defesa_previa)) fields.defesa_previa = 'Indeferido'
    if (avanca(s.jari)) fields.jari = 'Indeferido'
    if (tela.prazo && tela.prazo !== (s.vencimento_cetran || null)) fields.vencimento_cetran = tela.prazo
  }
  fields.ultima_att = M.hoje()
  return fields
}

module.exports = { parseTelaSuspensao, montarUpdateSuspensao }
