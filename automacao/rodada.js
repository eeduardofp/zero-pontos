// ─── RODADA ──────────────────────────────────────────────────
// Motor da consulta: percorre a fila de placas, consulta o Detran e
// atualiza o workspace. Sem I/O de console — quem chama (CLI ou painel)
// fornece callbacks de progresso e de espera.
const S = require('./supabase.js')
const D = require('./detran.js')
const M = require('./mapeamento.js')
const R = require('./relatorio.js')
const Bloq = require('./bloqueios.js')

const PAUSA_ENTRE_PLACAS_MS = 3000
const MAX_TROCAS_LIMITE = 10

const STATUS_LABEL = a =>
  `DP:${a.defesa_previa || '—'} | JARI:${a.jari || '—'} | 2ª:${a.segunda_instancia || '—'}`

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Mesmo formato de id do app (data.js: genId)
const genId = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

const fmtBR = iso => {
  const [a, m, d] = (iso || '').split('-')
  return d ? `${d}/${m}/${a}` : iso || '—'
}

// opcoes: {
//   alvoIds: Set<placaId>|null,          // null = todas
//   dryRun: boolean,
//   consultarStatus: boolean,            // esteira de recursos das AITs (default true)
//   consultarComercial: boolean,         // garimpo de oportunidades (default true)
//   emit: (evento, dados) => void,       // 'inicio'|'placa'|'aviso'|'fim'
//   aguardarConfirmacao: async (tipo, msg) => void,  // 'login'|'limite'
//   deveParar: () => boolean             // true => encerra após a placa atual
// }
// retorna { resumo, arqRelatorio, itens }
async function executar(opcoes) {
  const { alvoIds, dryRun, emit, aguardarConfirmacao, deveParar } = opcoes
  const consultarStatus = opcoes.consultarStatus !== false
  const consultarComercial = opcoes.consultarComercial !== false

  await S.login()
  const { aits, placas, clientes } = await S.carregarAtivas()
  const bloq = Bloq.carregar()

  const porPlaca = new Map()
  for (const a of aits) {
    if (!porPlaca.has(a.placa_id)) porPlaca.set(a.placa_id, [])
    porPlaca.get(a.placa_id).push(a)
  }
  // Fila: com garimpo comercial ligado, TODAS as placas cadastradas (multa
  // nova aparece também em veículo sem AIT ativa); só status → apenas placas
  // com AIT ativa. Bloqueadas/inválidas caem nos filtros do laço. Placas com
  // AIT ativa primeiro (prioridade se o limite encerrar a rodada no meio).
  const fila = placas
    .map(p => p.id)
    .filter(id => consultarComercial || porPlaca.has(id))
    .filter(id => !alvoIds || alvoIds.has(id))
    .sort((a, b) => (porPlaca.has(b) ? 1 : 0) - (porPlaca.has(a) ? 1 : 0))

  // Base do garimpo: tudo que já conhecemos não é oportunidade
  let codigosConhecidos = []
  if (consultarComercial) {
    const comercial = await S.carregarComercial()
    codigosConhecidos = [
      ...comercial.codigosAits,
      ...comercial.oportunidades.map(o => o.codigo_ait).filter(Boolean)
    ]
  }

  // Login obrigatório e limpo a cada execução: apaga a sessão anterior
  // para o usuário poder entrar com a conta que quiser.
  D.limparSessao()
  const { ctx, page } = await D.abrirBrowser()
  await D.irParaInicio(page)
  await aguardarConfirmacao('login', 'Faça login no Detran Digital na janela do Chrome e clique em Continuar.')

  const itens = []
  const arqRelatorio = R.novoCaminho()   // caminho fixo — regravado a cada placa
  const flush = () => R.gerar(itens, dryRun, arqRelatorio)

  const nomeCliente = placa => {
    const c = clientes.find(x => x.id === placa.cliente_id)
    return c ? c.nome : '—'
  }
  const marcarTodas = (placa, tipo, detalhe) => {
    // placa sem AIT ativa gera uma linha única (senão sumiria do relatório)
    const alvo = porPlaca.get(placa.id) || [{ codigo: '—' }]
    const novos = alvo.map(a => ({
      cliente: nomeCliente(placa), placa: placa.placa, codigo: a.codigo, tipo, detalhe
    }))
    itens.push(...novos)
    return novos
  }

  emit('inicio', { total: fila.length, dryRun })
  let n = 0
  let trocasLimite = 0
  let parou = false

  for (const placaId of fila) {
    if (deveParar()) { parou = true; break }
    const aitsDaPlaca = porPlaca.get(placaId) || []
    const placa = placas.find(p => p.id === placaId)
    n++
    let novos = []

    if (!placa) {
      novos = aitsDaPlaca.map(a => ({ codigo: a.codigo, tipo: 'erro', detalhe: 'placa não encontrada no cadastro' }))
      itens.push(...novos)
      emit('placa', { n, total: fila.length, placa: '—', novos }); flush(); continue
    }

    // placa já sabidamente protegida → pula sem consultar
    if (bloq.estaBloqueada(placaId)) {
      novos = marcarTodas(placa, 'pulado-protegido', 'Bloqueada em rodada anterior — cliente sem autorização')
      emit('placa', { n, total: fila.length, placa: placa.placa, novos }); flush(); continue
    }

    // dados inválidos no cadastro → pula sem consultar, não toca ultima_att
    const placaOk = M.placaValida(placa.placa)
    const renavamOk = M.renavamValido(placa.renavan)
    if (!placaOk || !renavamOk) {
      const falta = !placaOk && !renavamOk ? 'placa e renavam inválidos'
                  : !renavamOk ? `renavam ausente/inválido ("${placa.renavan}")`
                  : `placa inválida ("${placa.placa}")`
      novos = marcarTodas(placa, 'dados-invalidos', falta)
      emit('placa', { n, total: fila.length, placa: placa.placa, novos }); flush(); continue
    }

    // cadastro guarda "QJC8G88/SC" e renavam formatado — o site quer limpo
    const placaLimpa = M.limparPlaca(placa.placa)
    const renavamLimpo = M.limparRenavam(placa.renavan)

    let tentativaTecnica = 0
    let resolvido = false
    while (!resolvido) {
      let desfecho
      try {
        desfecho = await D.abrirDossie(page, placaLimpa, renavamLimpo, { incluirInfracoes: consultarComercial })
      } catch (e) {
        // erro técnico (navegação/timeout): 1 retry, depois marca erro
        tentativaTecnica++
        if (tentativaTecnica > 1) {
          const shot = await D.screenshotErro(page, placaLimpa)
          novos = marcarTodas(placa, 'erro', `${e.message} (screenshot: ${shot})`)
          break
        }
        continue
      }

      if (desfecho.status === 'ok') {
        novos = await processarDossie(page, placa, aitsDaPlaca, clientes, dryRun,
          { consultarStatus, consultarComercial, codigosConhecidos })
        itens.push(...novos)
        resolvido = true
      } else if (desfecho.status === 'protegido') {
        bloq.bloquear(placaId, { placa: placa.placa, motivo: 'protegido' })
        novos = marcarTodas(placa, 'sem-permissao', 'Veículo protegido — cliente não autorizou (flagada para próximas rodadas)')
        resolvido = true
      } else if (desfecho.status === 'limite') {
        // limite atingido → troca de conta e RETENTA a mesma placa
        trocasLimite++
        if (trocasLimite > MAX_TROCAS_LIMITE) {
          novos = marcarTodas(placa, 'limite', 'Limite persistente — placa não consultada nesta rodada')
          parou = true
          resolvido = true
        } else {
          emit('aviso', { tipo: 'limite', msg: `Limite de consultas atingido (troca ${trocasLimite}/${MAX_TROCAS_LIMITE}).` })
          // desloga a conta atual sem fechar o Chrome
          await ctx.clearCookies().catch(() => {})
          await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} }).catch(() => {})
          await D.irParaInicio(page)
          await aguardarConfirmacao('limite', 'Limite atingido. Faça login com OUTRA conta na janela do Chrome e clique em Continuar.')
        }
      } else {
        // desfecho desconhecido — guarda texto p/ refino e segue
        const shot = await D.screenshotErro(page, placaLimpa)
        const semResposta = !/erro/i.test(desfecho.texto)
        const detalhe = semResposta
          ? `site não retornou o dossiê (veículo fora de SC?) (screenshot: ${shot})`
          : `desfecho não reconhecido: "${desfecho.texto.slice(0, 200)}" (screenshot: ${shot})`
        novos = marcarTodas(placa, 'erro', detalhe)
        resolvido = true
      }
    }

    emit('placa', { n, total: fila.length, placa: placa.placa, novos })
    flush()
    if (parou) break
    await sleep(PAUSA_ENTRE_PLACAS_MS)
  }

  await ctx.close()
  flush()
  const resumo = {}
  for (const i of itens) resumo[i.tipo] = (resumo[i.tipo] || 0) + 1
  emit('fim', { resumo, arqRelatorio, parou })
  return { resumo, arqRelatorio, itens }
}

// Consulta um dossiê já aberto e devolve os itens de relatório das AITs da placa.
// escopo: { consultarStatus, consultarComercial, codigosConhecidos }
// - status: esteira de recursos das AITs ativas
// - comercial: garimpo de oportunidades (débito do ano sem defesa e desconhecido)
async function processarDossie(page, placa, aits, clientes, dryRun, escopo) {
  const { consultarStatus, consultarComercial, codigosConhecidos } = escopo
  const cliente = clientes.find(c => c.id === placa.cliente_id)
  const nomeCliente = cliente ? cliente.nome : '—'
  const itens = []

  const recursos = await D.todosRecursos(page)
  // débitos: status precisa quando há indeferimento (data limite); comercial sempre
  const precisaDebitos = consultarComercial || recursos.some(r => {
    const m = M.mapResultado(r.resultado)
    return m && m.precisaDataLimite
  })
  const debitos = precisaDebitos ? await D.todosDebitos(page) : []

  for (const ait of consultarStatus ? aits : []) {
    // cards do site que citam o código desta AIT e pertencem a uma etapa da esteira.
    // Ordena do mais antigo para o mais novo: com dois processos na mesma
    // instância, o mais recente sobrescreve por último no montarUpdate.
    const achados = recursos
      .filter(r => r.instancia && M.contemCodigo(r.texto, ait.codigo))
      .sort((a, b) => (a.dataRequerimento || '').localeCompare(b.dataRequerimento || ''))
      .map(r => ({
        instancia: r.instancia,
        resultado: r.resultado,
        dataLimite: (debitos.find(d => M.contemCodigo(d.texto, ait.codigo)) || {}).data || null
      }))
    const up = M.montarUpdate(ait, achados)
    const antes = STATUS_LABEL(ait)

    // diff real: só é "atualizado" se algum valor de fato mudou
    const ROTULO = { defesa_previa: 'DP', jari: 'JARI', segunda_instancia: '2ª', encerrado: 'Encerrada', vencimento: 'Vencimento' }
    const mudancas = Object.keys(ROTULO)
      .filter(k => k in up && String(up[k] == null ? '' : up[k]) !== String(ait[k] == null ? '' : ait[k]))
    const alteracao = mudancas.map(k => `${ROTULO[k]}: ${ait[k] || '—'} → ${up[k]}`).join('; ')

    if (!dryRun) await S.updateAIT(ait.id, up)

    itens.push({
      cliente: nomeCliente, placa: placa.placa, codigo: ait.codigo,
      tipo: achados.length === 0 ? 'nao-encontrado' : (mudancas.length ? 'atualizado' : 'sem-mudanca'),
      alteracao,
      antes, depois: STATUS_LABEL({ ...ait, ...up }),
      vencimento: up.vencimento || '',
      detalhe: up.encerrado ? 'AIT encerrada' : ''
    })
  }

  // ── Garimpo comercial: multa nova sem defesa = possível venda ──
  if (!consultarComercial) return itens
  const infracoes = await D.todasInfracoes(page)
  const achadosComercial = M.garimparOportunidades({
    debitos, recursos, codigosConhecidos, infracoes, ano: new Date().getFullYear()
  })
  for (const o of achadosComercial) {
    if (!dryRun) {
      await S.criarOportunidade({
        id: genId('op'),
        cliente_id: placa.cliente_id || null,
        placa_id: placa.id,
        codigo_ait: o.codigo,
        descricao: o.descricao || 'Garimpada pela consulta automática',
        valor_ait: o.valor,
        valor_servico: o.valorServico,
        prazo_defesa: o.prazoDefesa,
        prazo_vencimento: o.data,
        data_identificacao: M.hoje(),
        status: 'Aberta'
      })
    }
    codigosConhecidos.push(o.codigo)   // não duplica se reaparecer na rodada
    const partes = [
      o.descricao || 'Multa sem defesa',
      `vence ${fmtBR(o.data)}`,
      o.valor != null ? `multa R$ ${o.valor.toFixed(2).replace('.', ',')}` : null,
      o.valorServico != null ? `serviço R$ ${o.valorServico.toFixed(2).replace('.', ',')}` : 'serviço a definir',
      o.prazoDefesa ? `defesa até ${fmtBR(o.prazoDefesa)}` : null
    ].filter(Boolean)
    itens.push({
      cliente: nomeCliente, placa: placa.placa, codigo: o.codigo,
      tipo: 'oportunidade',
      vencimento: o.data,
      detalhe: partes.join(' · ')
    })
  }
  return itens
}

module.exports = { executar }
