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

// Casamento de código de AIT: maiúsculas e sem espaços dos dois lados —
// o site às vezes insere espaço dentro do código (ex.: "1V 5379787").
function normalizar(s) {
  return (s || '').toUpperCase().replace(/\s+/g, '')
}

// Núcleo do identificador: nos códigos estruturados
// (PREFIXO-NNNNNN-NÚCLEO-EEEE-D) é o 3º segmento contando do fim.
// A seção Débitos trunca o dígito final e abrevia o prefixo
// ("JOINVIL-...-7455" vs "JOINVILLE-...-7455-0"), então o casamento
// confiável é pelo núcleo. Sem estrutura → código inteiro normalizado.
function nucleoCodigo(codigo) {
  const partes = String(codigo == null ? '' : codigo).split('-')
  if (partes.length >= 4) {
    const nucleo = normalizar(partes[partes.length - 3])
    if (nucleo.length >= 6) return nucleo
  }
  return normalizar(codigo)
}

function contemCodigo(texto, codigo) {
  if (!codigo) return false
  const t = normalizar(texto)
  if (t.includes(normalizar(codigo))) return true
  const nucleo = nucleoCodigo(codigo)
  return nucleo.length >= 6 && t.includes(nucleo)
}

// Cadastro guarda a placa com sufixo de UF ("QJC8G88/SC") e às vezes com
// separadores. O site quer só os 7 caracteres. Limpa: tira o que vem depois
// da barra, remove não-alfanuméricos e sobe para maiúsculas.
function limparPlaca(p) {
  return (p == null ? '' : String(p)).split('/')[0].replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

function limparRenavam(r) {
  return (r == null ? '' : String(r)).replace(/\D/g, '')
}

// Placa: 7 caracteres alfanuméricos (antigo ABC1234 ou Mercosul ABC1D23),
// validada já limpa. Filtra cadastros com lixo (ex.: "TOXICOLOGICO").
function placaValida(p) {
  return /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(limparPlaca(p))
}

// Renavam: 9 a 11 dígitos, validado já limpo.
function renavamValido(r) {
  return /^\d{9,11}$/.test(limparRenavam(r))
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

  // Cascata de consistência: instância posterior existente implica anterior
  // indeferida (JARI só existe se DP foi indeferida; 2ª só se JARI foi).
  // Impede estado impossível (DP aguardando + JARI aguardando) e regressão
  // de etapa já julgada. "Não realizado" é estado válido — não mexe.
  let merged = { ...ait, ...fields }
  const existe = v => v && v !== 'Não realizado'
  if (existe(merged.segunda_instancia) && (!merged.jari || merged.jari === 'Aguardando')) {
    fields.jari = 'Indeferido'
    merged = { ...merged, jari: 'Indeferido' }
  }
  if (existe(merged.jari) && (!merged.defesa_previa || merged.defesa_previa === 'Aguardando')) {
    fields.defesa_previa = 'Indeferido'
    merged = { ...merged, defesa_previa: 'Indeferido' }
  }

  // Abertura da próxima etapa: indeferido deixa a etapa seguinte como
  // "Não realizado" (nunca vazia) — com vencimento definido, o workspace
  // joga a AIT automaticamente na fila de recursos. Só preenche etapa
  // vazia: "Aguardando" significa recurso já protocolado, não sobrescreve.
  if (merged.defesa_previa === 'Indeferido' && !merged.jari) {
    fields.jari = 'Não realizado'
    merged = { ...merged, jari: 'Não realizado' }
  }
  if (merged.jari === 'Indeferido' && !merged.segunda_instancia) {
    fields.segunda_instancia = 'Não realizado'
    merged = { ...merged, segunda_instancia: 'Não realizado' }
  }

  if (!ait.encerrado && deveEncerrar(merged)) fields.encerrado = true
  fields.ultima_att = hoje()
  return fields
}

module.exports = { mapResultado, parseDataBR, hoje, deveEncerrar, montarUpdate, normalizar, nucleoCodigo, contemCodigo, limparPlaca, limparRenavam, placaValida, renavamValido }
