// ─── APP ──────────────────────────────────────────────────────
// Lógica principal: navegação e renderização de cada página

// ── ESTADO DE PAGINAÇÃO ───────────────────────────────────────
let clPage = 1, aitPage = 1, finPage = 1
let kanbanAno = 'todos', kanbanGroup = 'cliente'

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
async function initApp() {
  UI.setLoading(true)
  const session = await Auth.requireAuth()
  if (!session) return

  document.getElementById('user-email').textContent = session.user.email

  try {
    const db = await API.loadAll()
    Data.load(db)
    UI.updateStats()
    nav('dashboard')
  } catch (e) {
    UI.notif('Erro ao carregar dados: ' + e.message, 'error')
  } finally {
    UI.setLoading(false)
  }
}

// ── NAVEGAÇÃO ─────────────────────────────────────────────────
function nav(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('#sidebar nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page))
  document.getElementById('pg-' + page).classList.add('active')
  if (page === 'dashboard')  renderDashboard()
  if (page === 'clientes')   renderClientes(1)
  if (page === 'aits')       renderAITs(1)
  if (page === 'kanban')     renderKanban()
  if (page === 'recursos')   renderRecursos()
  if (page === 'financeiro') renderFinanceiro()
  if (page === 'comercial')  Comercial.render()
  if (page === 'cadastro')   initCadastro()
  if (page === 'busca')      document.getElementById('busca-q').focus()
}

// ── DASHBOARD ─────────────────────────────────────────────────
function renderDashboard() {
  const aits = Data.getAITs()
  const ativas = aits.filter(a => !a.encerrado).length
  const urg = aits.filter(a => !a.encerrado && Data.daysSince(a.ultima_att) >= 21).length
  const fat = aits.reduce((s, a) => s + (a.valor || 0), 0)

  document.getElementById('dash-metrics').innerHTML =
    `<div class="metric"><div class="metric-label">Total AITs</div><div class="metric-val">${aits.length}</div><div class="metric-sub">no sistema</div></div>` +
    `<div class="metric"><div class="metric-label">Em curso</div><div class="metric-val" style="color:var(--blue)">${ativas}</div><div class="metric-sub">processos ativos</div></div>` +
    `<div class="metric"><div class="metric-label">Faturamento</div><div class="metric-val" style="color:var(--green);font-size:18px">${Data.fmtMoeda(fat)}</div><div class="metric-sub">total registrado</div></div>` +
    `<div class="metric"><div class="metric-label">Verificar agora</div><div class="metric-val" style="color:var(--red)">${urg}</div><div class="metric-sub">+21d sem atualização</div></div>`

  const urgList = aits.filter(a => !a.encerrado && Data.daysSince(a.ultima_att) >= 21).slice(0, 8)
  const tb = document.getElementById('dash-urgentes')
  tb.innerHTML = urgList.length
    ? urgList.map(a => {
        const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
        return `<tr onclick="openAIT('${a.id}')" style="cursor:pointer">
          <td class="bold" style="font-size:11px;font-family:var(--mono)">${a.codigo.slice(0, 30)}</td>
          <td>${cl ? cl.nome.split(' ')[0] : '—'}</td>
          <td>${UI.badge(Data.daysSince(a.ultima_att) >= 999 ? 'Aguardando' : 'Indeferido')}</td></tr>`
      }).join('')
    : '<tr><td colspan="3" style="padding:20px;text-align:center;color:var(--text3)">Nenhuma urgente</td></tr>'

  const counts = { Aguardando: 0, Indeferido: 0, Deferido: 0, 'Não realizado': 0 }
  aits.filter(a => !a.encerrado).forEach(a => {
    const s = Data.statusAtual(a)
    if (counts[s] !== undefined) counts[s]++
    else counts['Aguardando']++
  })
  const tot = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  const colors = { Aguardando: 'amber', Indeferido: 'red', Deferido: 'green', 'Não realizado': 'text3' }
  document.getElementById('dash-chart').innerHTML = Object.keys(counts).map(k => {
    const v = counts[k], pct = Math.round(v / tot * 100), col = colors[k]
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:var(--text2)">${k}</span>
        <span style="color:var(--${col});font-family:var(--mono)">${v}</span>
      </div>
      <div style="height:4px;background:var(--bg3);border-radius:2px">
        <div style="height:4px;background:var(--${col});border-radius:2px;width:${pct}%"></div>
      </div></div>`
  }).join('')
}

// ── BUSCA ─────────────────────────────────────────────────────
function doBusca() {
  const q = document.getElementById('busca-q').value.trim().toLowerCase()
  const tipo = document.getElementById('busca-tipo').value
  const out = document.getElementById('busca-res')
  if (!q) { out.innerHTML = '<div style="color:var(--text3);text-align:center;padding:40px">Digite para pesquisar</div>'; return }
  let html = ''

  if (tipo === 'todos' || tipo === 'cliente') {
    const cls = Data.getClientes().filter(c => c.nome.toLowerCase().includes(q)).slice(0, 8)
    if (cls.length) {
      html += `<div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-bottom:6px${html ? ';margin-top:16px' : ''}">CLIENTES</div>`
      html += `<div class="tbl-wrap" style="margin-bottom:12px"><table style="table-layout:fixed"><thead><tr><th style="width:50%">Nome</th><th>AITs ativas</th><th>Placas</th></tr></thead><tbody>`
      cls.forEach(c => {
        const aa = Data.aitsDe(c.id).filter(a => !a.encerrado).length
        html += `<tr onclick="openCliente('${c.id}')"><td class="bold">${c.nome}</td><td>${aa}</td><td>${Data.placasDe(c.id).length}</td></tr>`
      })
      html += '</tbody></table></div>'
    }
  }

  if (tipo === 'todos' || tipo === 'placa') {
    const pls = Data.getPlacas().filter(p => p.placa.toLowerCase().includes(q) || p.renavan.toLowerCase().includes(q)).slice(0, 8)
    if (pls.length) {
      html += `<div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-bottom:6px${html ? ';margin-top:16px' : ''}">PLACAS</div>`
      html += `<div class="tbl-wrap" style="margin-bottom:12px"><table style="table-layout:fixed"><thead><tr><th>Placa</th><th>Renavan</th><th>Cliente</th><th>AITs</th></tr></thead><tbody>`
      pls.forEach(p => {
        const cl = Data.gCliente(p.cliente_id)
        html += `<tr onclick="openCliente('${p.cliente_id}')"><td class="bold" style="font-family:var(--mono)">${p.placa}</td><td style="font-family:var(--mono)">${p.renavan}</td><td>${cl ? cl.nome : '—'}</td><td>${Data.aitsDaPlaca(p.id).length}</td></tr>`
      })
      html += '</tbody></table></div>'
    }
  }

  if (tipo === 'todos' || tipo === 'ait') {
    const as = Data.getAITs().filter(a =>
      a.codigo.toLowerCase().includes(q) ||
      (a.enquadramento || '').toLowerCase().includes(q) ||
      (a.protocolo || '').toLowerCase().includes(q)
    ).slice(0, 12)
    if (as.length) {
      html += `<div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-bottom:6px${html ? ';margin-top:16px' : ''}">AITs</div>`
      html += `<div class="tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:30%">AIT</th><th>Cliente</th><th>Placa</th><th style="width:110px">Etapa</th><th style="width:100px">Status</th></tr></thead><tbody>`
      as.forEach(a => {
        const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
        html += `<tr onclick="openAIT('${a.id}')">
          <td class="bold" style="font-family:var(--mono);font-size:11px">${a.codigo.slice(0, 35)}</td>
          <td>${cl ? cl.nome.slice(0, 18) : '—'}</td>
          <td style="font-family:var(--mono)">${pl ? pl.placa : '—'}</td>
          <td style="font-size:12px">${Data.etapaAtual(a)}</td>
          <td>${UI.badge(Data.statusAtual(a))}</td></tr>`
      })
      html += '</tbody></table></div>'
    } else if (q.length > 6) {
      html += `<div style="margin-top:10px;padding:14px;background:var(--amber-bg);border:1px solid var(--amber);border-radius:var(--radius);color:var(--amber);font-size:13px"><strong>AIT não encontrada no sistema</strong> — pode ser uma possível venda!</div>`
    }
  }

  out.innerHTML = html || '<div style="color:var(--text3);text-align:center;padding:40px">Nenhum resultado encontrado</div>'
}

// ── CLIENTES ──────────────────────────────────────────────────
function renderClientes(p) {
  if (p) clPage = p
  const q = document.getElementById('clientes-q').value.toLowerCase()
  let list = Data.getClientes().filter(c => !q || c.nome.toLowerCase().includes(q))
  document.getElementById('clientes-sub').textContent = list.length + ' clientes'
  const PER = 20, total = Math.ceil(list.length / PER) || 1
  if (clPage > total) clPage = 1
  document.getElementById('clientes-body').innerHTML = list.slice((clPage - 1) * PER, clPage * PER).map(c => {
    const aa = Data.aitsDe(c.id), at = aa.filter(a => !a.encerrado).length
    const pls = Data.placasDe(c.id).map(p => p.placa).join(', ')
    const urg = aa.some(a => !a.encerrado && Data.daysSince(a.ultima_att) >= 21)
    return `<tr onclick="openCliente('${c.id}')">
      <td class="bold">${c.nome}${urg ? ' <span class="badge b-no" style="font-size:10px">!</span>' : ''}</td>
      <td style="font-size:12px;font-family:var(--mono)">${pls.slice(0, 40)}</td>
      <td><span style="color:var(--blue)">${at}</span></td>
      <td>${aa.length}</td>
      <td>${at > 0 ? '<span class="badge b-wait">Ativo</span>' : '<span class="badge b-na">Enc.</span>'}</td></tr>`
  }).join('')
  UI.renderPager('clientes-pager', clPage, total, renderClientes)
}

// ── AITs ──────────────────────────────────────────────────────
function renderAITs(p) {
  if (p) aitPage = p
  const q = document.getElementById('aits-q').value.toLowerCase()
  const st = document.getElementById('aits-status').value
  let list = Data.getAITs().filter(a => {
    if (q) {
      const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
      const match = a.codigo.toLowerCase().includes(q) ||
        (a.enquadramento || '').toLowerCase().includes(q) ||
        (pl && pl.placa.toLowerCase().includes(q)) ||
        (cl && cl.nome.toLowerCase().includes(q))
      if (!match) return false
    }
    if (st === 'ativo') return !a.encerrado
    if (st === 'encerrado') return a.encerrado
    if (['Aguardando', 'Indeferido', 'Deferido'].includes(st)) return Data.statusAtual(a) === st
    return true
  })
  document.getElementById('aits-sub').textContent = list.length + ' AITs'
  const PER = 25, total = Math.ceil(list.length / PER) || 1
  if (aitPage > total) aitPage = 1
  document.getElementById('aits-body').innerHTML = list.slice((aitPage - 1) * PER, aitPage * PER).map(a => {
    const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
    return `<tr onclick="openAIT('${a.id}')">
      <td class="bold" style="font-family:var(--mono);font-size:11px">${a.codigo.slice(0, 32)}</td>
      <td>${cl ? cl.nome.slice(0, 20) : '—'}</td>
      <td style="font-family:var(--mono)">${pl ? pl.placa : '—'}</td>
      <td style="font-size:12px;color:var(--text3)">${(a.enquadramento || '—').slice(0, 28)}</td>
      <td style="font-size:12px">${Data.etapaAtual(a)}</td>
      <td>${UI.badge(Data.statusAtual(a))}</td>
      <td style="font-family:var(--mono);color:var(--text3)">${a.ano}</td></tr>`
  }).join('')
  UI.renderPager('aits-pager', aitPage, total, renderAITs)
}

// ── KANBAN ────────────────────────────────────────────────────
function initKanbanFilters() {
  const anos = {}
  Data.getAITs().filter(a => !a.encerrado).forEach(a => { anos[a.ano] = true })
  const sorted = Object.keys(anos).sort().reverse()
  let html = `<button class="fbtn ${kanbanAno === 'todos' ? 'on' : ''}" onclick="setKanbanAno('todos',this)">Todos</button>`
  sorted.forEach(y => { html += `<button class="fbtn ${kanbanAno === y ? 'on' : ''}" onclick="setKanbanAno('${y}',this)">${y}</button>` })
  document.getElementById('kanban-year-filters').innerHTML = html
}

function setKanbanAno(ano, btn) {
  kanbanAno = ano
  document.getElementById('kanban-year-filters').querySelectorAll('.fbtn').forEach(b => b.classList.remove('on'))
  btn.classList.add('on')
  renderKanban()
}

function setKanbanGroup(g, btn) {
  kanbanGroup = g
  document.querySelectorAll('#kb-grp-cliente,#kb-grp-urgencia').forEach(b => b.classList.remove('on'))
  btn.classList.add('on')
  renderKanban()
}

function kCard(a) {
  const pl = Data.gPlaca(a.placa_id)
  const d = Data.daysSince(a.ultima_att)
  const info = d === 999 ? 'Nunca att.' : d + 'd sem att.'
  const urgCls = d >= 21 ? 'style="border-left:3px solid var(--red)"'
               : d >= 10 ? 'style="border-left:3px solid var(--amber)"' : ''
  const venc = a.vencimento ? ' \u00b7 vence ' + Data.fmtData(a.vencimento) : ''
  return '<div class="kcard" ' + urgCls + ' onclick="openKanbanCard(\'' + a.id + '\')">' +
    '<div class="kcard-ait">' + a.codigo.slice(0, 38) + '</div>' +
    '<div class="kcard-placa">' + (pl ? pl.placa : '\u2014') + ' \u00b7 ' + (pl ? pl.renavan : '\u2014') + '</div>' +
    '<div class="kcard-foot"><span class="badge b-blue" style="font-size:10px">' + Data.etapaAtual(a) + '</span>' +
    '<span class="kcard-days">' + info + venc + '</span></div>' +
    '</div>'
}

function renderKanban() {
  initKanbanFilters()

  // Critério: só AITs não encerradas que precisam ser verificadas (>=10d sem att)
  // Filtro de ano respeitado — ao atualizar todas de 2026, cliente some do kanban de 2026
  function kUrgScore(a) {
    const d = Data.daysSince(a.ultima_att)
    if (d >= 21) return 1
    if (d >= 10) return 2
    return 3
  }

  const ativas = Data.getAITs().filter(a =>
    !a.encerrado &&
    Data.daysSince(a.ultima_att) >= 10 &&
    (kanbanAno === 'todos' || String(a.ano) === String(kanbanAno))
  )

  const board = document.getElementById('kanban-board')

  if (kanbanGroup === 'urgencia') {
    board.className = 'kanban'
    const urg = [], warn = []
    ativas.forEach(a => {
      if (kUrgScore(a) === 1) urg.push(a)
      else warn.push(a)
    })
    function colCards(list) {
      if (!list.length) return '<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px">Nenhuma</div>'
      return list.map(a => {
        const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
        const d = Data.daysSince(a.ultima_att)
        const info = d === 999 ? 'Nunca att.' : d + 'd sem att.'
        const venc = a.vencimento ? ' \u00b7 vence ' + Data.fmtData(a.vencimento) : ''
        return '<div class="kcard" onclick="openKanbanCard(\'' + a.id + '\')">' +
          '<div class="kcard-ait">' + a.codigo.slice(0, 38) + '</div>' +
          '<div class="kcard-name">' + (cl ? cl.nome.split(' ').slice(0,2).join(' ') : '\u2014') + '</div>' +
          '<div class="kcard-placa">' + (pl ? pl.placa : '\u2014') + ' \u00b7 ' + (pl ? pl.renavan : '\u2014') + '</div>' +
          '<div class="kcard-foot"><span class="badge b-blue" style="font-size:10px">' + Data.etapaAtual(a) + '</span>' +
          '<span class="kcard-days">' + info + venc + '</span></div></div>'
      }).join('')
    }
    board.innerHTML =
      '<div class="kcol urgent"><div class="kcol-title">Verificar agora <span class="cnt">' + urg.length + '</span></div>' + colCards(urg) + '</div>' +
      '<div class="kcol warn"><div class="kcol-title">Verificar em breve <span class="cnt">' + warn.length + '</span></div>' + colCards(warn) + '</div>'
    return
  }

  board.className = ''
  board.style.display = 'block'
  const clienteMap = {}
  ativas.forEach(a => {
    const pl = Data.gPlaca(a.placa_id)
    const cid = pl ? pl.cliente_id : '_sem'
    if (!clienteMap[cid]) clienteMap[cid] = []
    clienteMap[cid].push(a)
  })
  const grupos = Object.keys(clienteMap).map(cid => {
    const aitsG = clienteMap[cid]
    aitsG.sort((a, b) => kUrgScore(a) - kUrgScore(b))
    return { cid, aits: aitsG, score: Math.min.apply(null, aitsG.map(kUrgScore)) }
  }).sort((a, b) => a.score - b.score)

  if (!grupos.length) {
    const label = kanbanAno === 'todos' ? 'todos os anos' : kanbanAno
    board.innerHTML = '<div style="color:var(--text3);text-align:center;padding:40px">Todas as AITs de ' + label + ' est\u00e3o atualizadas \u2705</div>'
    return
  }

  board.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">' +
    grupos.map(g => {
      const cl = Data.gCliente(g.cid)
      const nome = cl ? cl.nome : 'Cliente desconhecido'
      const hc = g.score === 1 ? 'var(--red)' : 'var(--amber)'
      const hb = g.score === 1 ? 'var(--red-bg)' : 'var(--amber-bg)'
      return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">' +
        '<div style="padding:10px 14px;background:' + hb + ';border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="openCliente(\'' + g.cid + '\')">' +
        '<span style="font-size:13px;font-weight:600;color:' + hc + '">' + nome.split(' ').slice(0, 3).join(' ') + '</span>' +
        '<span class="badge b-na" style="font-size:10px">' + g.aits.length + ' AIT' + (g.aits.length > 1 ? 's' : '') + '</span>' +
        '</div><div style="padding:8px">' + g.aits.map(kCard).join('') + '</div></div>'
    }).join('') + '</div>'
}

// ── RECURSOS ──────────────────────────────────────────────────
function renderRecursos() {
  const list = Data.getAITs().filter(Data.precisaRecurso)
    .sort((a, b) => {
      const ua = Data.urgLabel(a.vencimento).o, ub = Data.urgLabel(b.vencimento).o
      if (ua !== ub) return ua - ub
      return (Data.daysUntil(a.vencimento) || 9999) - (Data.daysUntil(b.vencimento) || 9999)
    })
  const body = document.getElementById('recursos-body')
  body.innerHTML = list.length ? list.map(a => {
    const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
    const prox = Data.proximaEtapa(a), u = Data.urgLabel(a.vencimento)
    return `<tr>
      <td class="bold">${cl ? cl.nome.split(' ').slice(0, 2).join(' ') : '—'}</td>
      <td style="font-family:var(--mono);font-size:11px">${pl ? pl.placa : '—'}<br><span style="color:var(--text3)">${pl ? pl.renavan : '—'}</span></td>
      <td style="font-family:var(--mono);font-size:11px;cursor:pointer;color:var(--blue)" onclick="openAIT('${a.id}')">${a.codigo.slice(0, 28)}</td>
      <td style="font-size:12px;color:var(--text3)">${(a.enquadramento || '—').slice(0, 22)}</td>
      <td><span class="badge b-blue">${prox}</span></td>
      <td style="font-family:var(--mono);font-size:12px">${a.vencimento || '—'}</td>
      <td><span class="badge ${u.c}">${u.t}</span></td>
      <td><button class="btn btn-primary btn-sm" onclick="openRecurso('${a.id}')">Protocolar</button></td></tr>`
  }).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Nenhum recurso pendente</td></tr>'
}

// ── FINANCEIRO ────────────────────────────────────────────────
const MESES = Data.MESES

function initFinDropdowns() {
  const anoSel = document.getElementById('fin-ano')
  const mesSel = document.getElementById('fin-mes')
  if (!anoSel || !mesSel) return
  const curAno = anoSel.value || 'todos'
  const curMes = mesSel.value || 'todos'

  const anos = {}
  Data.getAITs().forEach(a => {
    if (a.data_venda) anos[a.data_venda.slice(0, 4)] = true
    else if (a.valor > 0) anos[a.ano] = true
  })
  const anosSort = Object.keys(anos).sort().reverse()
  anoSel.innerHTML = '<option value="todos">Todos os anos</option>' +
    anosSort.map(y => `<option value="${y}" ${curAno === y ? 'selected' : ''}>${y}</option>`).join('')

  const meses = {}
  Data.getAITs().forEach(a => {
    if (!a.data_venda) return
    const y = a.data_venda.slice(0, 4), m = a.data_venda.slice(5, 7)
    if (curAno === 'todos' || curAno === y) meses[m] = true
  })
  mesSel.innerHTML = '<option value="todos">Todos os meses</option>' +
    Object.keys(meses).sort().map(m => `<option value="${m}" ${curMes === m ? 'selected' : ''}>${MESES[parseInt(m, 10) - 1]}</option>`).join('')
  if (curMes !== 'todos') mesSel.value = curMes
}

function renderFinanceiro() {
  initFinDropdowns()
  const q   = document.getElementById('fin-q').value.toLowerCase()
  const st  = document.getElementById('fin-status').value
  const ano = document.getElementById('fin-ano').value
  const mes = document.getElementById('fin-mes').value

  function passaTempo(a) {
    if (ano === 'todos' && mes === 'todos') return true
    if (!a.data_venda) return ano === 'todos' && mes === 'todos'
    const y = a.data_venda.slice(0, 4), m = a.data_venda.slice(5, 7)
    if (ano !== 'todos' && ano !== y) return false
    if (mes !== 'todos' && mes !== m) return false
    return true
  }

  const base = Data.getAITs().filter(a => a.valor > 0 && passaTempo(a))
  const totalVendido  = base.reduce((s, a) => s + (a.valor || 0), 0)
  const totalRecebido = base.filter(a => a.pagamento === 'Recebido').reduce((s, a) => s + (a.valor || 0), 0)
  const totalPendente = base.filter(a => !a.pagamento || a.pagamento === 'Pendente').reduce((s, a) => s + (a.valor || 0), 0)
  const qtdPend       = base.filter(a => !a.pagamento || a.pagamento === 'Pendente').length

  document.getElementById('fin-metrics').innerHTML =
    `<div class="metric"><div class="metric-label">Total vendido</div><div class="metric-val" style="font-size:20px">${Data.fmtMoeda(totalVendido)}</div><div class="metric-sub">${base.length} serviços</div></div>` +
    `<div class="metric"><div class="metric-label">Recebido</div><div class="metric-val" style="color:var(--green);font-size:20px">${Data.fmtMoeda(totalRecebido)}</div><div class="metric-sub">pagamentos confirmados</div></div>` +
    `<div class="metric"><div class="metric-label">Pendente</div><div class="metric-val" style="color:var(--amber);font-size:20px">${Data.fmtMoeda(totalPendente)}</div><div class="metric-sub">${qtdPend} aguardando</div></div>` +
    `<div class="metric"><div class="metric-label">% recebido</div><div class="metric-val" style="font-size:20px">${totalVendido > 0 ? Math.round(totalRecebido / totalVendido * 100) : 0}%</div><div class="metric-sub">do total vendido</div></div>`

  let list = base.filter(a => {
    const pag = a.pagamento || 'Pendente'
    if (st !== 'todos' && pag !== st) return false
    if (q) {
      const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
      return a.codigo.toLowerCase().includes(q) || (cl && cl.nome.toLowerCase().includes(q))
    }
    return true
  }).sort((a, b) => {
    const pa = a.pagamento || 'Pendente', pb = b.pagamento || 'Pendente'
    if (pa !== pb) return pa === 'Pendente' ? -1 : 1
    const cla = Data.gCliente((Data.gPlaca(a.placa_id) || {}).cliente_id)
    const clb = Data.gCliente((Data.gPlaca(b.placa_id) || {}).cliente_id)
    return (cla ? cla.nome : '').localeCompare(clb ? clb.nome : '', 'pt-BR')
  })

  const PER = 30, pages = Math.ceil(list.length / PER) || 1
  if (finPage > pages) finPage = 1
  const body = document.getElementById('fin-body')
  body.innerHTML = list.slice((finPage - 1) * PER, finPage * PER).map(a => {
    const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
    const pag = a.pagamento || 'Pendente'
    const badgePag = pag === 'Recebido' ? '<span class="badge b-ok">Recebido</span>' : '<span class="badge b-wait">Pendente</span>'
    const btnPag   = pag === 'Recebido'
      ? `<button class="btn btn-ghost btn-sm" onclick="togglePag('${a.id}')">Desfazer</button>`
      : `<button class="btn btn-primary btn-sm" onclick="togglePag('${a.id}')">Receber</button>`
    let contatoHTML = ''
    if (cl && cl.contato) contatoHTML += `<a href="https://wa.me/55${cl.contato.replace(/[^0-9]/g, '')}" target="_blank" title="WhatsApp" style="color:var(--green);text-decoration:none;margin-right:4px">W</a>`
    if (cl && cl.email)   contatoHTML += `<a href="mailto:${cl.email}" title="${cl.email}" style="color:var(--blue);text-decoration:none">@</a>`
    if (!contatoHTML) contatoHTML = '<span style="color:var(--text3)">—</span>'
    return `<tr>
      <td class="bold" style="cursor:pointer" onclick="openCliente('${cl ? cl.id : ''}')">${cl ? cl.nome.slice(0, 22) : '—'}</td>
      <td style="text-align:center;font-size:13px">${contatoHTML}</td>
      <td style="font-family:var(--mono);font-size:11px;cursor:pointer;color:var(--blue)" onclick="openAIT('${a.id}')">${a.codigo.slice(0, 26)}</td>
      <td style="font-size:12px;color:var(--text3)">${(a.enquadramento || '—').slice(0, 22)}</td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--text2)">${Data.fmtData(a.data_venda)}</td>
      <td style="font-family:var(--mono);font-weight:500;color:var(--text)">${Data.fmtMoeda(a.valor)}</td>
      <td>${badgePag}</td>
      <td>${btnPag}</td></tr>`
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Nenhum serviço encontrado</td></tr>'

  UI.renderPager('fin-pager', finPage, pages, p => { finPage = p; renderFinanceiro() })
}

async function togglePag(aid) {
  const a = Data.gAIT(aid)
  if (!a) return
  const novo = (!a.pagamento || a.pagamento === 'Pendente') ? 'Recebido' : 'Pendente'
  try {
    await API.updateAIT(aid, { pagamento: novo })
    Data.updateAITCache(aid, { pagamento: novo })
    renderFinanceiro()
    UI.notif(novo === 'Recebido' ? 'Pagamento confirmado!' : 'Marcado como pendente')
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}

// ── CADASTROS ─────────────────────────────────────────────────
function initCadastro() {
  UI.acBuild('ac-placa-list', '', Data.getClientes(), c => {
    document.getElementById('ac-placa-q').value = c.nome
    document.getElementById('ac-placa-val').value = c.id
    document.getElementById('ac-placa-list').classList.remove('open')
  })
  UI.acBuild('ac-ait-list', '', Data.getClientes(), c => {
    document.getElementById('ac-ait-q').value = c.nome
    document.getElementById('ac-ait-val').value = c.id
    document.getElementById('ac-ait-list').classList.remove('open')
    loadPlacasSelect(c.id)
  })
}

function acFilter(prefix) {
  const q = document.getElementById(prefix + '-q').value
  document.getElementById(prefix + '-val').value = ''
  const cb = prefix === 'ac-placa'
    ? c => { document.getElementById('ac-placa-q').value = c.nome; document.getElementById('ac-placa-val').value = c.id; document.getElementById('ac-placa-list').classList.remove('open') }
    : c => { document.getElementById('ac-ait-q').value = c.nome; document.getElementById('ac-ait-val').value = c.id; document.getElementById('ac-ait-list').classList.remove('open'); loadPlacasSelect(c.id) }
  UI.acBuild(prefix + '-list', q, Data.getClientes(), cb)
  document.getElementById(prefix + '-list').classList.add('open')
}

function acOpen(prefix) { acFilter(prefix) }
function acClose(prefix) { setTimeout(() => document.getElementById(prefix + '-list').classList.remove('open'), 160) }

function loadPlacasSelect(cid) {
  const sel = document.getElementById('f-ait-placa')
  const pls = Data.placasDe(cid)
  sel.innerHTML = pls.length
    ? pls.map(p => `<option value="${p.id}">${p.placa} · ${p.renavan}</option>`).join('')
    : '<option value="">Nenhuma placa cadastrada</option>'
}

async function salvarCliente() {
  const nome = document.getElementById('f-nome').value.trim()
  if (!nome) { UI.notif('Digite o nome', 'error'); return }
  const obj = {
    id: Data.genId('c'),
    nome: nome.toUpperCase(),
    contato: document.getElementById('f-contato').value.trim(),
    email: document.getElementById('f-email').value.trim(),
    cadastro: Data.today()
  }
  try {
    const saved = await API.createCliente(obj)
    Data.addCliente(saved)
    UI.updateStats()
    ;['f-nome', 'f-contato', 'f-email'].forEach(id => document.getElementById(id).value = '')
    UI.notif('Cliente cadastrado!')
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}

async function salvarPlaca() {
  const cid = document.getElementById('ac-placa-val').value
  if (!cid) { UI.notif('Selecione um cliente', 'error'); return }
  const placa = document.getElementById('f-placa').value.trim().toUpperCase()
  const renavan = document.getElementById('f-renavan').value.trim()
  if (!placa || !renavan) { UI.notif('Preencha placa e renavan', 'error'); return }
  const obj = { id: Data.genId('p'), placa, renavan, cliente_id: cid }
  try {
    const saved = await API.createPlaca(obj)
    Data.addPlaca(saved)
    ;['f-placa', 'f-renavan'].forEach(id => document.getElementById(id).value = '')
    document.getElementById('ac-placa-q').value = ''
    document.getElementById('ac-placa-val').value = ''
    UI.notif('Placa adicionada!')
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}

async function salvarAIT() {
  const cid = document.getElementById('ac-ait-val').value
  if (!cid) { UI.notif('Selecione um cliente', 'error'); return }
  const pid = document.getElementById('f-ait-placa').value
  if (!pid) { UI.notif('Selecione a placa', 'error'); return }
  const cod = document.getElementById('f-ait-cod').value.trim().toUpperCase()
  if (!cod) { UI.notif('Informe o código da AIT', 'error'); return }
  const obj = {
    id: Data.genId('a'),
    codigo: cod,
    placa_id: pid,
    enquadramento: document.getElementById('f-ait-enq').value.trim(),
    protocolo: document.getElementById('f-ait-proto').value.trim(),
    senha: document.getElementById('f-ait-senha').value.trim(),
    ano: new Date().getFullYear(),
    cadastro: Data.today(),
    ultima_att: Data.today(),
    vencimento: document.getElementById('f-ait-venc').value || null,
    data_venda: document.getElementById('f-ait-dvenda').value || null,
    observacao: document.getElementById('f-ait-obs').value.trim(),
    valor: parseFloat(document.getElementById('f-ait-valor').value) || 0,
    pagamento: 'Pendente',
    encerrado: false,
    defesa_previa: document.getElementById('f-ait-defesa').value,
    jari: '',
    segunda_instancia: ''
  }
  try {
    const saved = await API.createAIT(obj)
    Data.addAIT(saved)
    UI.updateStats()
    ;['f-ait-cod','f-ait-enq','f-ait-proto','f-ait-senha','f-ait-obs','f-ait-venc','f-ait-valor','f-ait-dvenda'].forEach(id => document.getElementById(id).value = '')
    document.getElementById('ac-ait-q').value = ''
    document.getElementById('ac-ait-val').value = ''
    UI.notif('AIT cadastrada!')
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}

// ── MODAIS ─────────────────────────────────────────────────────
function openCliente(cid) {
  const c = Data.gCliente(cid); if (!c) return
  const pls = Data.placasDe(cid)
  const aitsAll = Data.aitsDe(cid)
  const ativas = aitsAll.filter(a => !a.encerrado).length
  const fat = aitsAll.reduce((s, a) => s + (a.valor || 0), 0)

  const placasHTML = pls.map(pl => {
    const paits = Data.aitsDaPlaca(pl.id)
    const rows = paits.map((a, i) =>
      `<tr class="prow-${pl.id}" style="border-top:1px solid var(--border);cursor:pointer;${i >= 5 ? 'display:none' : ''}" onclick="openAIT('${a.id}')">
        <td style="padding:6px 0;font-family:var(--mono);font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.codigo}</td>
        <td style="padding:6px 4px;font-size:11px;color:var(--text3)">${Data.etapaAtual(a)}</td>
        <td style="padding:6px 0">${UI.badge(Data.statusAtual(a))}</td></tr>`
    ).join('')
    const more = paits.length > 5
      ? `<tr id="more-${pl.id}"><td colspan="3" style="padding:8px 0"><span onclick="expandPlaca('${pl.id}',${paits.length})" style="font-size:12px;color:var(--blue);cursor:pointer;font-family:var(--mono)">▸ ver todas as ${paits.length} AITs</span></td></tr>`
      : ''
    return `<div style="background:var(--bg);border-radius:var(--radius);padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div><span style="font-family:var(--mono);font-weight:500;color:var(--text)">${pl.placa}</span>
        <span style="font-family:var(--mono);font-size:12px;color:var(--text3);margin-left:12px">Renavan: ${pl.renavan}</span></div>
        <span class="badge b-blue">${paits.length} AITs</span>
      </div>
      <table style="width:100%;border-collapse:collapse">${rows}${more}</table></div>`
  }).join('')

  let contatoHTML = ''
  if (c.contato) contatoHTML += `<div style="margin-bottom:4px;font-size:13px">Contato: <span style="font-family:var(--mono)">${c.contato}</span></div>`
  if (c.email)   contatoHTML += `<div style="margin-bottom:4px;font-size:13px">E-mail: <a href="mailto:${c.email}" style="color:var(--blue);font-family:var(--mono)">${c.email}</a></div>`
  const fatHTML = fat > 0 ? `<div style="font-size:12px;color:var(--text3);margin-bottom:4px">Total: <span style="color:var(--green);font-family:var(--mono)">${Data.fmtMoeda(fat)}</span></div>` : ''

  UI.openModal(
    `<div class="modal-title">${c.nome}</div>
    <div class="modal-sub">${ativas} processos ativos · ${aitsAll.length} total</div>
    ${contatoHTML}${fatHTML}
    <div style="margin-top:14px"><div class="section-title">Placas e AITs</div>
    ${placasHTML || '<div style="color:var(--text3)">Nenhuma placa</div>'}</div>`
  )
}

function expandPlaca(pid, total) {
  document.querySelectorAll('.prow-' + pid).forEach(r => r.style.display = '')
  const m = document.getElementById('more-' + pid)
  if (m) m.innerHTML = `<td colspan="3" style="padding:6px 0"><span onclick="recolherPlaca('${pid}')" style="font-size:12px;color:var(--text3);cursor:pointer;font-family:var(--mono)">▴ recolher</span></td>`
}
function recolherPlaca(pid) {
  const rows = document.querySelectorAll('.prow-' + pid)
  rows.forEach((r, i) => { if (i >= 5) r.style.display = 'none' })
  const m = document.getElementById('more-' + pid)
  if (m) m.innerHTML = `<td colspan="3" style="padding:8px 0"><span onclick="expandPlaca('${pid}',${rows.length})" style="font-size:12px;color:var(--blue);cursor:pointer;font-family:var(--mono)">▸ ver todas as ${rows.length} AITs</span></td>`
}

function openAIT(aid) {
  const a = Data.gAIT(aid); if (!a) return
  const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
  const et = Data.etapaAtual(a), da = Data.daysSince(a.ultima_att)
  const etHTML = (key, label) => {
    const s = a[key] || '', cls = UI.etClass(s)
    return `<div class="etapa ${cls}"><div class="etapa-label">${label}</div><div class="etapa-val">${s || '—'}</div></div>`
  }
  UI.openModal(
    `<div class="modal-title" style="font-family:var(--mono);font-size:13px;word-break:break-all">${a.codigo}</div>
    <div class="modal-sub">${cl ? cl.nome : '—'} · ${pl ? pl.placa : '—'}${pl ? ' · Renavan: ' + pl.renavan : ''}</div>
    <div class="etapas" style="margin-bottom:16px">
      ${etHTML('defesa_previa','Defesa Prévia')}${etHTML('jari','JARI')}${etHTML('segunda_instancia','2ª Instância')}
    </div>
    <div class="section-title" style="margin-bottom:8px">Detalhes</div>
    <div class="field-grid" style="margin-bottom:16px">
      <div class="field"><div class="field-label">Enquadramento</div><div class="field-val">${a.enquadramento || '—'}</div></div>
      <div class="field"><div class="field-label">Etapa atual</div><div class="field-val">${et}</div></div>
      <div class="field"><div class="field-label">Protocolo</div><div class="field-val mono">${a.protocolo || '—'}</div></div>
      <div class="field"><div class="field-label">Senha</div><div class="field-val mono">${a.senha || '—'}</div></div>
      <div class="field"><div class="field-label">Última atualização</div><div class="field-val">${a.ultima_att || '—'}${da < 999 ? ' (' + da + 'd atrás)' : ''}</div></div>
      <div class="field"><div class="field-label">Vencimento</div><div class="field-val">${a.vencimento || '—'}</div></div>
      <div class="field"><div class="field-label">Data da venda</div><div class="field-val">${Data.fmtData(a.data_venda)}</div></div>
      <div class="field"><div class="field-label">Valor do serviço</div><div class="field-val" style="color:var(--green)">${a.valor ? Data.fmtMoeda(a.valor) : '—'}</div></div>
      <div class="field" style="grid-column:1/-1"><div class="field-label">Observações</div><div class="field-val">${a.observacao || '—'}</div></div>
    </div>
    <div class="section-title" style="margin-bottom:10px">Atualizar</div>
    <div class="form-row3" style="margin-bottom:8px">
      <div><label class="form-label">Defesa Prévia</label>${UI.etapaSelect('ed-def', a.defesa_previa)}</div>
      <div><label class="form-label">JARI</label>${UI.etapaSelect('ed-jari', a.jari)}</div>
      <div><label class="form-label">2ª Instância</label>${UI.etapaSelect('ed-seg', a.segunda_instancia)}</div>
    </div>
    <div class="form-row" style="margin-bottom:8px">
      <div><label class="form-label">Vencimento</label><input type="date" class="form-ctrl" id="ed-venc" value="${a.vencimento || ''}" style="font-size:12px"></div>
      <div><label class="form-label">Data da venda</label><input type="date" class="form-ctrl" id="ed-dvenda" value="${a.data_venda || ''}" style="font-size:12px"></div>
    </div>
    <div class="form-row" style="margin-bottom:12px">
      <div><label class="form-label">Valor (R$)</label><input type="number" step="0.01" class="form-ctrl" id="ed-valor" value="${a.valor || ''}" placeholder="0,00" style="font-size:12px"></div>
      <div><label class="form-label">Observação</label><input class="form-ctrl" id="ed-obs" value="${a.observacao || ''}" style="font-size:12px"></div>
    </div>
    <button class="btn btn-primary" onclick="salvarEdicaoAIT('${aid}')">Salvar</button>`
  )
}

async function salvarEdicaoAIT(aid) {
  const a = Data.gAIT(aid); if (!a) return
  const fields = {
    defesa_previa:      document.getElementById('ed-def').value  || a.defesa_previa,
    jari:               document.getElementById('ed-jari').value || a.jari,
    segunda_instancia:  document.getElementById('ed-seg').value  || a.segunda_instancia,
    vencimento:         document.getElementById('ed-venc').value  || null,
    data_venda:         document.getElementById('ed-dvenda').value || null,
    observacao:         document.getElementById('ed-obs').value,
    ultima_att:         Data.today()
  }
  const val = parseFloat(document.getElementById('ed-valor').value)
  if (!isNaN(val)) fields.valor = val
  if (Data.deveEncerrar({ ...a, ...fields })) fields.encerrado = true
  try {
    await API.updateAIT(aid, fields)
    Data.updateAITCache(aid, fields)
    UI.updateStats()
    UI.closeModal()
    UI.notif('AIT atualizada!')
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}

function openKanbanCard(aid) {
  const a = Data.gAIT(aid); if (!a) return
  const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
  const et = Data.etapaAtual(a)
  const etKey = et === 'Defesa Prévia' ? 'defesa_previa' : et === 'JARI' ? 'jari' : 'segunda_instancia'
  const qBtn = s => `<button class="btn ${a[etKey] === s ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="quickSt('${aid}','${etKey}','${s}')">${s}</button>`
  UI.openModal(
    `<div class="modal-title" style="font-family:var(--mono);font-size:13px;word-break:break-all">${a.codigo}</div>
    <div class="modal-sub">${cl ? cl.nome : '—'}</div>
    <div class="field-grid" style="margin:14px 0">
      <div class="field"><div class="field-label">Placa</div><div class="field-val mono">${pl ? pl.placa : '—'}</div></div>
      <div class="field"><div class="field-label">Renavan</div><div class="field-val mono">${pl ? pl.renavan : '—'}</div></div>
      <div class="field"><div class="field-label">Etapa atual</div><div class="field-val">${et}</div></div>
      <div class="field"><div class="field-label">Vencimento</div><div class="field-val">${a.vencimento || 'Não definido'}</div></div>
      ${a.protocolo ? `<div class="field"><div class="field-label">Protocolo</div><div class="field-val mono">${a.protocolo}</div></div>` : ''}
      ${a.senha ? `<div class="field"><div class="field-label">Senha</div><div class="field-val mono">${a.senha}</div></div>` : ''}
    </div>
    <div class="section-title" style="margin-bottom:8px">Atualizar: ${et}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      ${qBtn('Aguardando')}${qBtn('Deferido')}${qBtn('Indeferido')}${qBtn('Não realizado')}
    </div>
    <div class="form-row" style="margin-bottom:12px">
      <div><label class="form-label">Novo vencimento</label><input type="date" class="form-ctrl" id="kv-venc" value="${a.vencimento || ''}" style="font-size:12px"></div>
      <div><label class="form-label">Observação</label><input class="form-ctrl" id="kv-obs" value="${a.observacao || ''}" style="font-size:12px"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="checkKanbanCard('${aid}')">✓ Verificado</button>
      <button class="btn btn-ghost" onclick="UI.closeModal()">Fechar</button>
    </div>`
  )
}

async function quickSt(aid, key, status) {
  const a = Data.gAIT(aid); if (!a) return
  const fields = { [key]: status, ultima_att: Data.today() }
  if (Data.deveEncerrar({ ...a, ...fields })) fields.encerrado = true
  try {
    await API.updateAIT(aid, fields)
    Data.updateAITCache(aid, fields)
    openKanbanCard(aid)
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}

async function checkKanbanCard(aid) {
  const a = Data.gAIT(aid); if (!a) return
  const fields = { ultima_att: Data.today() }
  const venc = document.getElementById('kv-venc'); if (venc && venc.value) fields.vencimento = venc.value
  const obs  = document.getElementById('kv-obs');  if (obs) fields.observacao = obs.value
  if (Data.deveEncerrar({ ...a, ...fields })) fields.encerrado = true
  try {
    await API.updateAIT(aid, fields)
    Data.updateAITCache(aid, fields)
    UI.updateStats()
    UI.closeModal()
    renderKanban()
    UI.notif('Verificação registrada!')
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}

function openRecurso(aid) {
  const a = Data.gAIT(aid); if (!a) return
  const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
  const prox = Data.proximaEtapa(a), ant = prox === 'JARI' ? 'Defesa Prévia' : 'JARI'
  const etKey = prox === 'JARI' ? 'jari' : 'segunda_instancia'
  UI.openModal(
    `<div class="modal-title">Protocolar recurso</div>
    <div class="modal-sub">${cl ? cl.nome : '—'} · ${pl ? pl.placa : '—'} · ${pl ? pl.renavan : '—'}</div>
    <div class="field-grid" style="margin:14px 0">
      <div class="field" style="grid-column:1/-1"><div class="field-label">AIT</div><div class="field-val mono" style="font-size:11px">${a.codigo}</div></div>
      <div class="field"><div class="field-label">Enquadramento</div><div class="field-val">${a.enquadramento || '—'}</div></div>
      <div class="field"><div class="field-label">${ant} (anterior)</div><div class="field-val" style="color:var(--red)">Indeferido</div></div>
      <div class="field"><div class="field-label">Recurso a fazer</div><div class="field-val" style="color:var(--blue);font-weight:500">${prox}</div></div>
      ${a.protocolo ? `<div class="field"><div class="field-label">Protocolo</div><div class="field-val mono">${a.protocolo}</div></div>` : ''}
      ${a.senha ? `<div class="field"><div class="field-label">Senha</div><div class="field-val mono">${a.senha}</div></div>` : ''}
    </div>
    <div class="info-box blue" style="margin-bottom:14px">Ao confirmar, <strong>${prox}</strong> será marcado como <strong>Aguardando</strong> e a AIT voltará para a fila de verificação.</div>
    <div class="form-row" style="margin-bottom:14px">
      <div><label class="form-label">Novo prazo</label><input type="date" class="form-ctrl" id="rv-venc" value="${a.vencimento || ''}" style="font-size:12px"></div>
      <div><label class="form-label">Observação</label><input class="form-ctrl" id="rv-obs" value="${a.observacao || ''}" style="font-size:12px"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="confirmarRecurso('${aid}','${etKey}')">✓ Recurso protocolado</button>
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
    </div>`
  )
}

async function confirmarRecurso(aid, etKey) {
  const a = Data.gAIT(aid); if (!a) return
  const fields = { [etKey]: 'Aguardando', ultima_att: Data.today() }
  const venc = document.getElementById('rv-venc'); if (venc && venc.value) fields.vencimento = venc.value
  const obs  = document.getElementById('rv-obs');  if (obs) fields.observacao = obs.value
  try {
    await API.updateAIT(aid, fields)
    Data.updateAITCache(aid, fields)
    UI.updateStats()
    UI.closeModal()
    renderRecursos()
    UI.notif('Recurso protocolado — AIT voltou para verificação!')
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}
