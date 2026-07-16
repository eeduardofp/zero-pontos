// ─── HOME "HOJE" ──────────────────────────────────────────────
// Landing: prioridades por prazo + métricas. Absorve o antigo dashboard.
const Home = (() => {
  function urgGrupo(prazo) {
    const d = Data.daysUntil(prazo)
    if (d === null) return 3
    if (d < 0) return 0
    if (d <= 7) return 1
    if (d <= 30) return 2
    return 3
  }
  const TITULOS = ['Vencidos', 'Vence em até 7 dias', 'Vence em até 30 dias', 'Sem prazo definido']

  async function render() {
    if (typeof Suspensoes !== 'undefined') await Suspensoes.garantirCarregado()
    const aits = Data.getAITs()
    const ativas = aits.filter(a => !a.encerrado).length
    const verificar = aits.filter(a => !a.encerrado && Data.daysSince(a.ultima_att) >= 21).length
    const susList = typeof Suspensoes !== 'undefined' ? Suspensoes.getLista() : []
    const recursos = aits.filter(Data.precisaRecurso).length + susList.filter(Suspensoes.precisaRecurso).length
    const fat = aits.reduce((s, a) => s + (a.valor || 0), 0)

    const itens = []
    aits.filter(Data.precisaRecurso).forEach(a => {
      const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
      itens.push({ tipo: 'ait', id: a.id, cliente: cl ? cl.nome : '—', cod: a.codigo, etapa: Data.proximaEtapa(a), prazo: a.vencimento })
    })
    susList.filter(Suspensoes.precisaRecurso).forEach(s => {
      const cl = Data.gCliente(s.cliente_id), prox = Suspensoes.proximaEtapa(s)
      const prazoSus = prox === 'Defesa Prévia' ? s.vencimento_defesa_previa : prox === 'JARI' ? s.vencimento_jari : s.vencimento_cetran
      itens.push({ tipo: 'sus', id: s.id, cliente: cl ? cl.nome : '—', cod: 'Proc ' + (s.processo || '—'), etapa: prox, prazo: prazoSus })
    })

    const grupos = [[], [], [], []]
    itens.forEach(it => grupos[urgGrupo(it.prazo)].push(it))
    // suspensões primeiro dentro do grupo, depois por urgência
    grupos.forEach(g => g.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'sus' ? -1 : 1
      return (Data.daysUntil(a.prazo) ?? 9999) - (Data.daysUntil(b.prazo) ?? 9999)
    }))

    const metric = (l, v, c) => `<div class="metric"><div class="metric-label">${l}</div><div class="metric-val"${c ? ` style="color:${c}"` : ''}>${v}</div></div>`
    const linha = it => {
      const u = Data.urgLabel(it.prazo)
      const tag = it.tipo === 'sus' ? '<span class="badge b-no" style="margin-right:6px">⚠ CNH</span>' : ''
      const acao = it.tipo === 'sus' ? `openRecursoSus('${it.id}')` : `openRecurso('${it.id}')`
      const abre = it.tipo === 'sus' ? `Suspensoes.abrirDetalhe('${it.id}')` : `openAIT('${it.id}')`
      return `<tr>
        <td class="bold" style="cursor:pointer" onclick="${abre}">${tag}${it.cliente.split(' ').slice(0, 2).join(' ')}</td>
        <td style="font-family:var(--mono);font-size:11px;cursor:pointer" onclick="${abre}">${(it.cod || '').slice(0, 26)}</td>
        <td><span class="badge b-blue">${it.etapa || '—'}</span></td>
        <td style="font-family:var(--mono);font-size:12px">${it.prazo || '—'}</td>
        <td><span class="badge ${u.c}">${u.t}</span></td>
        <td><button class="btn btn-primary btn-sm" onclick="${acao}">Protocolar</button></td></tr>`
    }
    const bloco = i => grupos[i].length
      ? `<div class="hoje-grupo"><div class="hoje-gt g${i}">${TITULOS[i]} · ${grupos[i].length}</div>
          <div class="tbl-wrap"><table style="table-layout:auto"><tbody>${grupos[i].map(linha).join('')}</tbody></table></div></div>`
      : ''

    document.getElementById('pg-hoje').innerHTML =
      `<div class="page-header"><div><div class="page-title">Hoje</div><div class="page-sub">Prioridades por prazo</div></div></div>
       <div class="metrics">${metric('AITs ativas', ativas)}${metric('A verificar', verificar, 'var(--amber)')}${metric('Recursos pendentes', recursos, 'var(--red)')}${metric('Faturamento', Data.fmtMoeda(fat), 'var(--green)')}</div>
       ${[0, 1, 2, 3].map(bloco).join('') || '<div style="color:var(--text3);padding:20px">Nada pendente 🎉</div>'}`
  }
  return { render }
})()
