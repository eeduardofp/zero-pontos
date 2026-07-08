// ─── MAPEAMENTO ───────────────────────────────────────────────
// Regras puras: resultado do site Detran → campos da AIT no workspace.
// Sem I/O — tudo testável.

const MAPA_RESULTADO = {
  'indeferido': 'Indeferido',
  'não conhecido': 'Indeferido',
  'nao conhecido': 'Indeferido',
  'deferido': 'Deferido',
  'cadastrado sem decisão': 'Aguardando',
  'cadastrado sem decisao': 'Aguardando',
  'efeito suspensivo': 'Aguardando'
}

function mapResultado(resultadoSite) {
  const chave = (resultadoSite || '').trim().toLowerCase()
  const status = MAPA_RESULTADO[chave]
  if (!status) return null
  return { status, precisaDataLimite: status === 'Indeferido' }
}

function parseDataBR(txt) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((txt || '').trim())
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function hoje() {
  return new Date().toISOString().split('T')[0]
}

// Mesma regra de encerramento do app (data.js: deveEncerrar)
function deveEncerrar(a) {
  return a.defesa_previa === 'Deferido' ||
         a.jari === 'Deferido' ||
         a.segunda_instancia === 'Deferido' ||
         a.segunda_instancia === 'Indeferido'
}

// achados: [{ instancia: 'defesa_previa'|'jari'|'segunda_instancia',
//             resultado: string, dataLimite: 'aaaa-mm-dd'|null }]
// Retorna objeto de campos a gravar na AIT. Sempre inclui ultima_att.
function montarUpdate(ait, achados) {
  const fields = {}
  for (const a of achados) {
    const m = mapResultado(a.resultado)
    if (!m) continue
    fields[a.instancia] = m.status
    if (m.precisaDataLimite && a.dataLimite) fields.vencimento = a.dataLimite
  }
  const merged = { ...ait, ...fields }
  if (!ait.encerrado && deveEncerrar(merged)) fields.encerrado = true
  fields.ultima_att = hoje()
  return fields
}

module.exports = { mapResultado, parseDataBR, hoje, deveEncerrar, montarUpdate }
