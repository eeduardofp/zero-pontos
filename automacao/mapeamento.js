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
// (PREFIXO-NNNNNN-NÚCLEO-EEEE-D) é o único segmento longo com letras E
// dígitos misturados (os demais são só letras ou só dígitos). A posição
// varia com truncamento — Débitos corta o dígito final e abrevia o prefixo
// ("JOINVIL-...-7455" vs "JOINVILLE-...-7455-0") — mas o formato não.
// Ambíguo ou sem estrutura → 3º do fim / código inteiro normalizado.
function nucleoCodigo(codigo) {
  const partes = String(codigo == null ? '' : codigo).split('-').map(normalizar)
  const cand = partes.filter(p => p.length >= 6 && /[A-Z]/.test(p) && /\d/.test(p))
  if (cand.length === 1 && partes.length > 1) return cand[0]
  if (partes.length >= 4) {
    const nucleo = partes[partes.length - 3]
    if (nucleo.length >= 6) return nucleo
  }
  return normalizar(codigo)
}

// Chave de casamento: os últimos 7 caracteres do núcleo. O site sempre insere
// eventuais espaços logo depois dos 2 primeiros caracteres do núcleo — o final
// nunca é cortado — então usar só o final tolera tanto o espaço quanto
// truncamentos de prefixo ainda não calibrados em fixture. Custo: colisão
// raríssima entre núcleos bem diferentes que só coincidem no final (~0,2% na
// base real) — aceito conscientemente em troca de robustez.
function chaveCodigo(codigo) {
  return nucleoCodigo(codigo).slice(-7)
}

function contemCodigo(texto, codigo) {
  if (!codigo) return false
  const t = normalizar(texto)
  if (t.includes(normalizar(codigo))) return true
  const chave = chaveCodigo(codigo)
  return chave.length >= 6 && t.includes(chave)
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

// "R$ 1.195,23" → 1195.23; texto sem número → null
function parseValorBR(txt) {
  const m = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/.exec(txt || '')
  if (!m) return null
  return parseFloat(m[1].replace(/\./g, '') + '.' + m[2])
}

// Dois códigos apontam para o mesmo auto? Casa nos dois sentidos porque
// Débitos trunca ("JOINVIL-...-7455" vs "JOINVILLE-...-7455-0").
function mesmoCodigo(a, b) {
  if (!a || !b) return false
  return contemCodigo(a, b) || contemCodigo(b, a)
}

// Tabela de valores Zero Pontos: valor da multa → preço do serviço.
// Casos especiais pela descrição: recusa de bafômetro e exame toxicológico.
const PRECO_BASE = [
  { multa: 88.38, preco: 60 },     // leve
  { multa: 130.16, preco: 80 },    // média
  { multa: 195.23, preco: 105 },   // grave
  { multa: 293.47, preco: 160 }    // gravíssima
]
const PRECO_GRAVISSIMA_X = { 2: 220, 3: 450, 4: 480, 5: 520, 6: 580, 7: 730, 10: 1050 }

function precoServico(descricao, valorMulta) {
  const desc = descricao || ''
  if (/recus/i.test(desc)) return 1500                    // recusa de bafômetro
  if (/toxicol/i.test(desc)) return 480                   // exame toxicológico
  if (typeof valorMulta !== 'number') return null
  const base = PRECO_BASE.find(p => Math.abs(p.multa - valorMulta) < 0.01)
  if (base) return base.preco
  const n = Math.round(valorMulta / 293.47)               // gravíssima Nx
  if (Math.abs(valorMulta - n * 293.47) < 0.05 && PRECO_GRAVISSIMA_X[n]) {
    return PRECO_GRAVISSIMA_X[n]
  }
  return null                                             // fora da tabela → manual
}

// Garimpo comercial: débito com vencimento no ano corrente, sem recurso de
// infração vinculado e sem registro conhecido (AITs do workspace + oportunidades
// já abertas) → possível venda. A aba INFRAÇÕES enriquece: descrição, valor
// oficial da multa, prazo de defesa e preço do serviço pela tabela.
// debitos: [{codigo, data, valor, texto}] · recursos: [{texto}]
// infracoes: [{numeroAuto, descricao, valorMulta, limiteDefesa}] (opcional)
function garimparOportunidades({ debitos, recursos, codigosConhecidos, ano, infracoes = [] }) {
  const out = []
  for (const d of debitos) {
    if (!d.codigo || !d.data) continue
    if (!d.data.startsWith(`${ano}-`)) continue
    if (recursos.some(r => contemCodigo(r.texto, d.codigo))) continue
    if (codigosConhecidos.some(c => mesmoCodigo(c, d.codigo))) continue
    if (out.some(o => mesmoCodigo(o.codigo, d.codigo))) continue

    const inf = infracoes.find(i => mesmoCodigo(i.numeroAuto, d.codigo)) || null
    const valor = inf && inf.valorMulta != null ? inf.valorMulta
                : d.valor == null ? null : d.valor
    out.push({
      codigo: d.codigo,
      data: d.data,                                       // vencimento do débito
      valor,
      descricao: inf ? inf.descricao || null : null,
      prazoDefesa: inf ? inf.limiteDefesa || null : null,
      valorServico: precoServico(inf ? inf.descricao : '', valor)
    })
  }
  return out
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

  // Abertura da próxima etapa: um indeferimento deixa a etapa seguinte como
  // "Não realizado" (nunca vazia) — com vencimento definido, o workspace joga
  // a AIT na fila de recursos. Só preenche etapa vazia ("Aguardando" já é
  // recurso protocolado, não sobrescreve).
  //
  // DP→JARI: o site mostra a JARI de forma confiável; abre sempre que DP está
  // indeferida e a JARI está vazia (se a JARI for feita, o site corrige).
  //
  // JARI→2ª: o site é CEGO para o status da 2ª. Um "Não realizado" colocado
  // por engano nunca se corrigiria e viraria defesa fantasma. Por isso a 2ª
  // só é aberta quando a JARI foi indeferida NESTE run (o programa acabou de
  // mudar o status) — aí subentende-se que a 2ª ainda não foi feita. Se a
  // JARI já era indeferida antes, não mexe.
  if (merged.defesa_previa === 'Indeferido' && !merged.jari) {
    fields.jari = 'Não realizado'
    merged = { ...merged, jari: 'Não realizado' }
  }
  const jariRecemIndeferida = ait.jari !== 'Indeferido' && merged.jari === 'Indeferido'
  if (jariRecemIndeferida && !merged.segunda_instancia) {
    fields.segunda_instancia = 'Não realizado'
    merged = { ...merged, segunda_instancia: 'Não realizado' }
  }

  if (!ait.encerrado && deveEncerrar(merged)) fields.encerrado = true
  fields.ultima_att = hoje()
  return fields
}

module.exports = { mapResultado, parseDataBR, hoje, deveEncerrar, montarUpdate, normalizar, nucleoCodigo, chaveCodigo, contemCodigo, limparPlaca, limparRenavam, placaValida, renavamValido, parseValorBR, mesmoCodigo, precoServico, garimparOportunidades }
