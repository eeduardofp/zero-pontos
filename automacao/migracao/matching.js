// ─── MATCHING (migração do legado) ───────────────────────────
// Funções puras: parsing dos caminhos do share e casamento com o banco.
// Nenhum acesso a disco ou rede aqui — tudo testável isolado.
const { mesmoCodigo } = require('../mapeamento')

const RAIZ_DEFESAS = '1. NOVO MODELO DEFESAS ADMINISTRATIVAS'
const EXTENSOES = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'xls', 'xlsx'])

function semAcento(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Nome da pasta de cliente: "12. MOACIR ROECKER" ou
// "DANIEL OSMAR ADELINO. Balantec" → nome canônico sem numeração/apelido.
function limparNomeCliente(pasta) {
  let s = String(pasta || '').trim()
  s = s.replace(/^\d+\.\s*/, '')            // numeração inicial
  s = s.split('.')[0]                        // qualificador após o primeiro ponto
  return semAcento(s).toUpperCase().replace(/\s+/g, ' ').trim()
}

// Caminho relativo ao share → níveis da árvore de defesas, ou null se
// estiver fora dela (ZERO PONTOS, Computador formatado Paulo, etc.)
function parseCaminho(relPath) {
  const partes = String(relPath || '').split('\\').filter(Boolean)
  if (partes.length < 4 || partes[0] !== RAIZ_DEFESAS) return null
  const m = partes[1].match(/^(Defesas|Suspensão CNH|Recusa Bafometro)\s+(\d{4})$/i)
  if (!m) return null
  const categoria = /suspens/i.test(m[1]) ? 'suspensao' : 'defesa'
  const ano = parseInt(m[2], 10)
  const cliente = limparNomeCliente(partes[2])
  const arquivo = partes[partes.length - 1]
  // partes[3] é a pasta de caso quando o arquivo está mais fundo que o
  // nível do cliente (subpastas tipo Documentos/ continuam no mesmo caso)
  const caso = partes.length >= 5 ? partes[3] : null
  return { categoria, ano, cliente, clientePasta: partes[2], caso, arquivo }
}

function incluirArquivo(nome) {
  const n = String(nome || '').toLowerCase()
  if (n === 'thumbs.db' || n === 'desktop.ini') return false
  const ext = n.split('.').pop()
  return EXTENSOES.has(ext)
}

function tipoDocumento(nome) {
  const n = semAcento(String(nome || '')).toLowerCase()
  if (/procurac/.test(n)) return 'Procuracao'
  if (/\bcnh\b/.test(n)) return 'CNH'
  if (/crlv/.test(n)) return 'CRLV'
  if (/protocolo|comprovante|senha/.test(n)) return 'Comprovante'
  if (/parecer|decisao|indeferi|deferi/.test(n)) return 'Parecer'
  if (/defesa|recurso|jari|cetran/.test(n)) return 'Defesa'
  if (/^na\b|^na[._]/.test(n)) return 'NA'
  if (/^np\b|^np[._]/.test(n)) return 'NP'
  if (/notifica/.test(n)) return 'NA'
  if (/\bait\b/.test(n)) return 'AIT'
  return 'Outro'
}

// Cliente da pasta → registro no banco. Exato primeiro; depois um-contém-o-outro
// (pastas trazem sobrenomes a mais/menos). Empate → null (revisão manual).
function casarClientePorNome(pasta, clientes) {
  const alvo = limparNomeCliente(pasta)
  if (!alvo) return null
  const norm = c => semAcento(c.nome || '').toUpperCase().replace(/\s+/g, ' ').trim()
  const exatos = clientes.filter(c => norm(c) === alvo)
  if (exatos.length === 1) return exatos[0]
  const parciais = clientes.filter(c => {
    const n = norm(c)
    return n.startsWith(alvo) || alvo.startsWith(n)
  })
  return parciais.length === 1 ? parciais[0] : null
}

// Pasta de caso → AIT. Restringe às AITs do cliente casado (via placas) e
// usa mesmoCodigo (tolerante a truncamento/formatos) contra o nome da pasta.
function casarAIT(nomeCaso, clienteId, dados) {
  const placasCliente = new Set(dados.placas.filter(p => p.cliente_id === clienteId).map(p => p.id))
  const doCliente = dados.aits.filter(a => placasCliente.has(a.placa_id))
  const casadas = doCliente.filter(a => a.codigo && mesmoCodigo(nomeCaso, a.codigo))
  if (casadas.length === 1) return { ait: casadas[0], confianca: 'alta' }
  if (casadas.length > 1) return { ait: casadas[0], confianca: 'ambigua' }
  return null
}

// Cliente → suspensão. A pasta de caso raramente traz o nº do processo;
// quando traz, desempata. Uma suspensão só no cliente → alta.
function casarSuspensao(nomeCaso, clienteId, suspensoes) {
  const doCliente = suspensoes.filter(s => s.cliente_id === clienteId)
  if (!doCliente.length) return null
  if (nomeCaso) {
    const porProcesso = doCliente.filter(s => s.processo && mesmoCodigo(nomeCaso, s.processo))
    if (porProcesso.length === 1) return { suspensao: porProcesso[0], confianca: 'alta' }
  }
  if (doCliente.length === 1) return { suspensao: doCliente[0], confianca: 'alta' }
  return { suspensao: doCliente[0], confianca: 'ambigua' }
}

module.exports = {
  parseCaminho, limparNomeCliente, incluirArquivo, tipoDocumento,
  casarClientePorNome, casarAIT, casarSuspensao, semAcento,
}
