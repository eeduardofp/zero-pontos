// ─── MAPEAMENTO ───────────────────────────────────────────────
// Regras puras: resultado do site Detran → campos da AIT no workspace.
// Sem I/O — tudo testável.

// Site exibe "Processo <resultado>" — casar por conteúdo, em ordem:
// "não conhecido" e "indeferido" antes de "deferido" (substring); \b impede
// que "Indeferido" case com /deferido/.
const REGRAS_RESULTADO = [
  { re: /n[ãa]o conhecido/i, status: 'Indeferido' },
  { re: /indeferido/i, status: 'Indeferido' },
  { re: /\bdeferido/i, status: 'Deferido' },
  { re: /cadastrado sem decis/i, status: 'Aguardando' },
  { re: /efeito suspensivo/i, status: 'Aguardando' }
]

function mapResultado(resultadoSite) {
  const txt = (resultadoSite || '').trim()
  if (!txt) return null
  const regra = REGRAS_RESULTADO.find(r => r.re.test(txt))
  if (!regra) return null
  return { status: regra.status, precisaDataLimite: regra.status === 'Indeferido' }
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
