// ─── APP ──────────────────────────────────────────────────────
// Lógica principal: navegação e renderização de cada página

// ── ESTADO DE PAGINAÇÃO ───────────────────────────────────────
let clPage = 1, aitPage = 1, finPage = 1
let kanbanAno = 'todos', kanbanGroup = 'cliente'

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
async function initApp() {
  UI.initTheme()
  UI.setLoading(true)
  const session = await Auth.requireAuth()
  if (!session) return

  document.getElementById('user-email').textContent = session.user.email

  try {
    const db = await API.loadAll()
    Data.load(db)
    UI.updateStats()
    nav('hoje')
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
  if (page === 'hoje')       (typeof Home !== 'undefined' ? Home.render() : renderDashboard())
  if (page === 'clientes')   renderClientes(1)
  if (page === 'aits')       renderAITs(1)
  if (page === 'kanban')     renderKanban()
  if (page === 'recursos')   renderRecursos()
  if (page === 'financeiro') renderFinanceiro()
  if (page === 'suspensoes') Suspensoes.render()
  if (page === 'calendario') Calendario.render()
  if (page === 'comercial')  Comercial.render()
  if (page === 'cadastro')   initCadastro()
  if (page === 'busca')      document.getElementById('busca-q').focus()
}

// ── BUSCA GLOBAL (topbar) ─────────────────────────────────────
function buscaGlobal(q) {
  const box = document.getElementById('global-results'); if (!box) return
  q = (q || '').trim().toLowerCase()
  if (q.length < 2) { box.classList.remove('open'); box.innerHTML = ''; return }
  const cli = Data.getClientes().filter(c => (c.nome || '').toLowerCase().includes(q) || (c.cpf || '').includes(q)).slice(0, 6)
  const pls = Data.getPlacas().filter(p => (p.placa || '').toLowerCase().includes(q) || (p.renavan || '').includes(q)).slice(0, 6)
  const ait = Data.getAITs().filter(a => (a.codigo || '').toLowerCase().includes(q) || (a.enquadramento || '').toLowerCase().includes(q)).slice(0, 8)
  const sus = (typeof Suspensoes !== 'undefined' ? Suspensoes.getLista() : []).filter(s => (s.processo || '').toLowerCase().includes(q)).slice(0, 6)
  const sec = (t, arr, fn) => arr.length ? `<div class="gr-sec">${t}</div>` + arr.map(fn).join('') : ''
  box.innerHTML =
    sec('Clientes', cli, c => `<div class="gr-item" onclick="openCliente('${c.id}');fecharBusca()">${c.nome}${c.cpf ? ' · ' + c.cpf : ''}</div>`) +
    sec('Placas', pls, p => { const cl = Data.gCliente(p.cliente_id); return `<div class="gr-item" onclick="openCliente('${p.cliente_id}');fecharBusca()"><span style="font-family:var(--mono)">${p.placa}</span> · ${cl ? cl.nome : '—'}</div>` }) +
    sec('AITs', ait, a => `<div class="gr-item" onclick="openAIT('${a.id}');fecharBusca()"><span style="font-family:var(--mono)">${a.codigo}</span> · ${a.enquadramento || '—'}</div>`) +
    sec('Suspensões', sus, s => `<div class="gr-item" onclick="Suspensoes.abrirDetalhe('${s.id}');fecharBusca()">Proc ${s.processo || '—'}</div>`)
    || '<div class="gr-item" style="color:var(--text3)">Nada encontrado</div>'
  box.classList.add('open')
}
function fecharBusca() {
  const b = document.getElementById('global-results'); if (b) { b.classList.remove('open'); b.innerHTML = '' }
  const q = document.getElementById('global-q'); if (q) q.value = ''
}
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault(); const q = document.getElementById('global-q'); if (q) q.focus()
  }
})

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
      html += `<div class="tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:28%">AIT</th><th>Cliente</th><th style="width:90px">Placa</th><th style="width:110px">Etapa</th><th style="width:100px">Status</th><th style="width:70px">Ano</th></tr></thead><tbody>`
      as.forEach(a => {
        const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
        html += `<tr onclick="openAIT('${a.id}')">
          <td class="bold" style="font-family:var(--mono);font-size:11px">${a.codigo.slice(0, 35)}</td>
          <td>${cl ? cl.nome.slice(0, 18) : '—'}</td>
          <td style="font-family:var(--mono)">${pl ? pl.placa : '—'}</td>
          <td style="font-size:12px">${Data.etapaAtual(a)}</td>
          <td>${UI.badge(Data.statusAtual(a))}</td>
          <td style="font-family:var(--mono);color:var(--text3);white-space:nowrap">${a.ano || '—'}</td></tr>`
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
      <td style="font-family:var(--mono);color:var(--text3);white-space:nowrap">${a.ano}</td></tr>`
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
async function renderRecursos() {
  // Suspensões é uma página separada — se o usuário nunca abriu "Suspensões"
  // o cache dela está vazio. Garante que está carregado antes de montar a fila.
  await Suspensoes.garantirCarregado()

  const aitItens = Data.getAITs().filter(Data.precisaRecurso).map(a => {
    const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
    return {
      tipo: 'ait', id: a.id,
      cliente: cl ? cl.nome : '—',
      identificador: (pl ? pl.placa : '—') + '<br><span style="color:var(--text3)">' + (pl ? pl.renavan : '—') + '</span>',
      codigo: a.codigo, enquadramento: a.enquadramento || '—',
      prox: Data.proximaEtapa(a), prazo: a.vencimento
    }
  })

  const susItens = Suspensoes.getLista().filter(Suspensoes.precisaRecurso).map(s => {
    const cl = Data.gCliente(s.cliente_id)
    const prox = Suspensoes.proximaEtapa(s)
    return {
      tipo: 'suspensao', id: s.id,
      cliente: cl ? cl.nome : '—',
      identificador: 'Processo ' + (s.processo || '—'),
      codigo: s.processo || '—', enquadramento: 'Suspensão do direito de dirigir',
      prox, prazo: prox === 'Defesa Prévia' ? s.vencimento_defesa_previa : prox === 'JARI' ? s.vencimento_jari : s.vencimento_cetran
    }
  })

  const porUrgencia = (x, y) => (Data.daysUntil(x.prazo) ?? 9999) - (Data.daysUntil(y.prazo) ?? 9999)
  // Suspensão sempre antes de AIT — consequência maior pro cliente.
  const list = [...susItens.sort(porUrgencia), ...aitItens.sort(porUrgencia)]

  const body = document.getElementById('recursos-body')
  body.innerHTML = list.length ? list.map(item => {
    const u = Data.urgLabel(item.prazo)
    const tag = item.tipo === 'suspensao' ? '<span class="badge b-no" style="margin-right:6px">⚠ CNH</span>' : ''
    const acao = item.tipo === 'suspensao' ? `openRecursoSus('${item.id}')` : `openRecurso('${item.id}')`
    const abreContexto = item.tipo === 'suspensao' ? `Suspensoes.abrirDetalhe('${item.id}')` : `openAIT('${item.id}')`
    const codigoAtributos = ` style="font-family:var(--mono);font-size:11px;cursor:pointer;color:var(--blue)" onclick="${abreContexto}"`
    return `<tr>
      <td class="bold">${tag}${item.cliente.split(' ').slice(0, 2).join(' ')}</td>
      <td style="font-family:var(--mono);font-size:11px">${item.identificador}</td>
      <td${codigoAtributos}>${item.codigo.slice(0, 28)}</td>
      <td style="font-size:12px;color:var(--text3)">${item.enquadramento.slice(0, 22)}</td>
      <td><span class="badge b-blue">${item.prox}</span></td>
      <td style="font-family:var(--mono);font-size:12px;white-space:nowrap">${item.prazo || '—'}</td>
      <td><span class="badge ${u.c}">${u.t}</span></td>
      <td><button class="btn btn-primary btn-sm" onclick="${acao}">Protocolar</button></td></tr>`
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
    cpf: document.getElementById('f-cpf').value.trim(),
    nascimento: document.getElementById('f-nascimento').value || null,
    cnh:      document.getElementById('f-cnh').value.trim(),
    rg:       document.getElementById('f-rg').value.trim(),
    endereco: document.getElementById('f-endereco').value.trim(),
    cep:      document.getElementById('f-cep').value.trim(),
    primario: document.getElementById('f-primario').value === '' ? null : document.getElementById('f-primario').value === 'sim',
    cadastro: Data.today()
  }
  try {
    const saved = await API.createCliente(obj)
    Data.addCliente(saved)
    UI.updateStats()
    ;['f-nome', 'f-contato', 'f-email', 'f-cpf', 'f-nascimento', 'f-cnh', 'f-rg', 'f-endereco', 'f-cep', 'f-primario'].forEach(id => document.getElementById(id).value = '')
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
        <span style="font-family:var(--mono);font-size:12px;color:var(--text3);margin-left:12px">Renavan: ${pl.renavan}</span>
        <span onclick="editarPlaca('${pl.id}','${cid}')" style="font-size:11px;color:var(--blue);cursor:pointer;margin-left:10px">✎ editar</span></div>
        <span class="badge b-blue">${paits.length} AITs</span>
      </div>
      <table style="width:100%;border-collapse:collapse">${rows}${more}</table></div>`
  }).join('')

  let contatoHTML = ''
  if (c.contato) contatoHTML += `<div style="margin-bottom:4px;font-size:13px">Contato: <span style="font-family:var(--mono)">${c.contato}</span></div>`
  if (c.email)   contatoHTML += `<div style="margin-bottom:4px;font-size:13px">E-mail: <a href="mailto:${c.email}" style="color:var(--blue);font-family:var(--mono)">${c.email}</a></div>`
  if (c.cnh)      contatoHTML += '<div style="margin-bottom:4px;font-size:13px">CNH: <span style="font-family:var(--mono)">' + c.cnh + '</span></div>'
  if (c.endereco) contatoHTML += '<div style="margin-bottom:4px;font-size:13px">Endereço: ' + c.endereco + (c.cep ? ' · CEP ' + c.cep : '') + '</div>'
  const fatHTML = fat > 0 ? `<div style="font-size:12px;color:var(--text3);margin-bottom:4px">Total: <span style="color:var(--green);font-family:var(--mono)">${Data.fmtMoeda(fat)}</span></div>` : ''

  const susCliente = (typeof Suspensoes !== 'undefined' ? Suspensoes.getLista() : []).filter(s => s.cliente_id === cid)
  const header =
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
    '<div style="flex:1;min-width:180px"><div class="modal-title">' + c.nome + '</div>' +
    '<div class="modal-sub" style="margin-top:6px">' + ativas + ' processos ativos · ' + aitsAll.length + ' total' + (fat > 0 ? ' · ' + Data.fmtMoeda(fat) : '') + '</div></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
    '<button class="btn btn-ghost btn-sm" onclick="editarCliente(\'' + cid + '\')">✎ Editar</button>' +
    '<button class="btn btn-ghost btn-sm" onclick="gerarRelatorioCliente(\'' + cid + '\')">📄 Relatório</button>' +
    '<button class="btn btn-ghost btn-sm" onclick="fundirCliente(\'' + cid + '\')">🔗 Fundir</button>' +
    '<button class="btn btn-danger btn-sm" onclick="excluirCliente(\'' + cid + '\')">Excluir</button>' +
    '</div></div>'

  const abas = [
    { id: 'info', label: 'Informação', render: () => (contatoHTML + fatHTML) || '<div style="color:var(--text3)">Sem dados de contato. Use Editar.</div>' },
    { id: 'docs', label: 'Documentos', render: () => { setTimeout(() => Documentos.render('docs-box-cli', { cliente_id: cid }), 0); return '<div id="docs-box-cli"></div>' } },
    { id: 'casos', label: 'AITs & placas', badge: aitsAll.length, render: () => placasHTML || '<div style="color:var(--text3)">Nenhuma placa</div>' },
    { id: 'sus', label: 'Suspensões', badge: susCliente.length, render: () => susCliente.length
        ? susCliente.map(s => `<div class="field" style="margin-bottom:6px;cursor:pointer" onclick="Suspensoes.abrirDetalhe('${s.id}')"><div class="field-label">Processo ${s.processo || '—'}</div><div class="field-val">${Suspensoes.etapaAtual(s)} · ${Suspensoes.statusAtual(s)}</div></div>`).join('')
        : '<div style="color:var(--text3)">Nenhuma suspensão</div>' },
    { id: 'fin', label: 'Financeiro', render: () => '<div class="field-grid"><div class="field"><div class="field-label">Total registrado</div><div class="field-val" style="color:var(--green)">' + Data.fmtMoeda(fat) + '</div></div></div><button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="gerarRelatorioCliente(\'' + cid + '\')">📄 Gerar relatório Excel</button>' }
  ]
  UI.tabs(header, abas, 'info')
}

async function fundirCliente(cid) {
  const base = Data.gCliente(cid); if (!base) return
  const nome = prompt('Fundir "' + base.nome + '" COM qual cliente? Digite parte do nome do cliente que vai PERMANECER:')
  if (!nome) return
  const alvos = Data.getClientes().filter(c => c.id !== cid && (c.nome || '').toLowerCase().includes(nome.toLowerCase()))
  if (alvos.length !== 1) { UI.notif(alvos.length ? 'Vários clientes batem, seja mais específico' : 'Nenhum cliente encontrado', 'error'); return }
  const alvo = alvos[0]
  if (!confirm('Mover placas, suspensões e documentos de "' + base.nome + '" para "' + alvo.nome + '" e apagar o duplicado?')) return
  const db = Auth.getClient()
  try {
    await db.from('placas').update({ cliente_id: alvo.id }).eq('cliente_id', cid)
    await db.from('suspensoes').update({ cliente_id: alvo.id }).eq('cliente_id', cid)
    await db.from('documentos').update({ cliente_id: alvo.id }).eq('cliente_id', cid)
    await db.from('clientes').delete().eq('id', cid)
    const all = await API.loadAll(); Data.load(all); UI.updateStats()
    UI.closeModal(); UI.notif('Clientes fundidos!')
    openCliente(alvo.id)
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}

function editarCliente(cid) {
  const c = Data.gCliente(cid); if (!c) return
  const parts = [
    '<div class="modal-title">Editar cliente</div>',
    '<div class="modal-sub">' + c.nome + '</div>',
    '<div class="form-group" style="margin-top:14px">',
    '<label class="form-label">Nome completo</label>',
    '<input class="form-ctrl" id="ec-nome" value="' + (c.nome || '') + '"></div>',
    '<div class="form-group">',
    '<label class="form-label">Contato / WhatsApp</label>',
    '<input class="form-ctrl" id="ec-contato" value="' + (c.contato || '') + '" placeholder="(47) 99999-9999"></div>',
    '<div class="form-group">',
    '<label class="form-label">E-mail</label>',
    '<input class="form-ctrl" id="ec-email" type="email" value="' + (c.email || '') + '" placeholder="cliente@email.com"></div>',
    '<div class="form-row" style="margin-bottom:14px">',
    '<div><label class="form-label">CPF</label><input class="form-ctrl" id="ec-cpf" value="' + (c.cpf || '') + '" placeholder="000.000.000-00"></div>',
    '<div><label class="form-label">Data de nascimento</label><input class="form-ctrl" id="ec-nascimento" type="date" value="' + (c.nascimento || '') + '"></div>',
    '</div>',
    '<div class="form-row" style="margin-bottom:14px">',
    '<div><label class="form-label">CNH</label><input class="form-ctrl" id="ec-cnh" value="' + (c.cnh || '') + '"></div>',
    '<div><label class="form-label">RG</label><input class="form-ctrl" id="ec-rg" value="' + (c.rg || '') + '"></div>',
    '</div>',
    '<div class="form-group">',
    '<label class="form-label">Endereço</label>',
    '<input class="form-ctrl" id="ec-endereco" value="' + (c.endereco || '') + '" placeholder="Rua, nº, bairro, Cidade/UF"></div>',
    '<div class="form-row" style="margin-bottom:14px">',
    '<div><label class="form-label">CEP</label><input class="form-ctrl" id="ec-cep" value="' + (c.cep || '') + '"></div>',
    '<div><label class="form-label">Primário (12m sem infração)</label><select class="form-ctrl" id="ec-primario">' +
      '<option value="" ' + (c.primario === null || c.primario === undefined ? 'selected' : '') + '>—</option>' +
      '<option value="sim" ' + (c.primario === true ? 'selected' : '') + '>Sim</option>' +
      '<option value="nao" ' + (c.primario === false ? 'selected' : '') + '>Não</option>' +
    '</select></div>',
    '</div>',
    '<div style="display:flex;gap:8px">',
    '<button class="btn btn-primary" id="ec-save">Salvar</button>',
    '<button class="btn btn-ghost" id="ec-cancel">Cancelar</button>',
    '</div>'
  ]
  UI.openModal(parts.join(''))
  document.getElementById('ec-save').onclick = function() { salvarEdicaoCliente(cid) }
  document.getElementById('ec-cancel').onclick = function() { openCliente(cid) }
}
async function salvarEdicaoCliente(cid) {
  const nome = document.getElementById('ec-nome').value.trim().toUpperCase()
  if (!nome) { UI.notif('Nome obrigatório', 'error'); return }
  const fields = {
    nome,
    contato:    document.getElementById('ec-contato').value.trim(),
    email:      document.getElementById('ec-email').value.trim(),
    cpf:        document.getElementById('ec-cpf').value.trim(),
    nascimento: document.getElementById('ec-nascimento').value || null,
    cnh:        document.getElementById('ec-cnh').value.trim(),
    rg:         document.getElementById('ec-rg').value.trim(),
    endereco:   document.getElementById('ec-endereco').value.trim(),
    cep:        document.getElementById('ec-cep').value.trim(),
    primario:   document.getElementById('ec-primario').value === '' ? null : document.getElementById('ec-primario').value === 'sim'
  }
  try {
    await Auth.getClient().from('clientes').update(fields).eq('id', cid)
    Data.updateClienteCache(cid, fields)
    UI.closeModal()
    UI.notif('Cliente atualizado!')
  } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
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

function editarPlaca(pid, cid) {
  const p = Data.gPlaca(pid); if (!p) return
  const cl = Data.gCliente(cid)
  const parts = [
    '<div class="modal-title">Editar placa</div>',
    '<div class="modal-sub">Vinculada a ' + (cl ? cl.nome : '—') + '</div>',
    '<div class="form-row" style="margin-top:14px;margin-bottom:14px">',
    '<div><label class="form-label">Placa</label>',
    '<input class="form-ctrl" id="ep-placa" value="' + (p.placa || '') + '"></div>',
    '<div><label class="form-label">Renavan</label>',
    '<input class="form-ctrl" id="ep-renavan" value="' + (p.renavan || '') + '"></div>',
    '</div>',
    '<div style="display:flex;gap:8px">',
    '<button class="btn btn-primary" id="ep-save">Salvar</button>',
    '<button class="btn btn-ghost" id="ep-cancel">Cancelar</button>',
    '<button class="btn btn-danger" id="ep-del">Excluir placa</button>',
    '</div>'
  ]
  UI.openModal(parts.join(''))
  document.getElementById('ep-save').onclick = function() { salvarEdicaoPlaca(pid, cid) }
  document.getElementById('ep-cancel').onclick = function() { openCliente(cid) }
  document.getElementById('ep-del').onclick = function() { excluirPlaca(pid, cid) }
}
async function salvarEdicaoPlaca(pid, cid) {
  const placa   = document.getElementById('ep-placa').value.trim().toUpperCase()
  const renavan = document.getElementById('ep-renavan').value.trim()
  if (!placa || !renavan) { UI.notif('Preencha placa e renavan', 'error'); return }
  const fields = { placa, renavan }
  try {
    await Auth.getClient().from('placas').update(fields).eq('id', pid)
    const idx = Data.getPlacas().findIndex(p => p.id === pid)
    if (idx >= 0) Object.assign(Data.getPlacas()[idx], fields)
    UI.closeModal()
    UI.notif('Placa atualizada!')
    setTimeout(() => openCliente(cid), 300)
  } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
}

// stepper de 3 etapas para AIT
function stepperAIT(a) {
  const et = Data.etapaAtual(a)
  const cell = (key, label, nome) => {
    const v = a[key] || ''
    const terminal = v === 'Deferido' || v === 'Indeferido'
    const cls = et === nome ? 'now' : (terminal ? 'done' : '')
    return `<div class="step ${cls}"><div class="sl">${label}</div><div class="sv">${v || '—'}</div><div class="sd">${et === nome ? 'etapa atual' : (terminal ? v.toLowerCase() : 'não iniciada')}</div></div>`
  }
  return `<div class="stepper">${cell('defesa_previa','Defesa Prévia','Defesa Prévia')}${cell('jari','JARI','JARI')}${cell('segunda_instancia','2ª Instância','2ª Instância')}</div>`
}

function openAIT(aid) {
  const a = Data.gAIT(aid); if (!a) return
  const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
  const et = Data.etapaAtual(a), da = Data.daysSince(a.ultima_att), u = Data.urgLabel(a.vencimento)
  const field = (label, val, mono) => `<div class="field"><div class="field-label">${label}</div><div class="field-val${mono ? ' mono' : ''}">${val || '—'}</div></div>`

  const header =
    `<div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div class="modal-title" style="font-family:var(--mono);word-break:break-all">${a.codigo}</div>
        <div class="chips" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          <span class="badge b-blue">Etapa: ${et}</span>${UI.badge(Data.statusAtual(a))}<span class="badge ${u.c}">${u.t}</span>
        </div>
        <div class="modal-sub" style="margin-top:8px">${cl ? `<a href="#" onclick="openCliente('${cl.id}');return false" style="color:var(--blue)">${cl.nome}</a>` : '—'} · ${pl ? pl.placa : '—'}${pl ? ' · Renavan ' + pl.renavan : ''} · ${a.enquadramento || '—'}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="UI._tabGo('editar')">✎ Editar</button>
        ${Data.precisaRecurso(a) ? `<button class="btn btn-primary btn-sm" onclick="openRecurso('${aid}')">⚖ Protocolar</button>` : ''}
      </div>
    </div>`

  const abas = [
    { id: 'info', label: 'Informação', render: () => stepperAIT(a) +
      '<div class="field-grid" style="margin-top:4px">' +
      field('Enquadramento', a.enquadramento) + field('Etapa atual', et) +
      field('Protocolo', a.protocolo, true) + field('Senha', a.senha, true) +
      field('Última atualização', (a.ultima_att || '—') + (da < 999 ? ` (${da}d atrás)` : '')) +
      field('Observações', a.observacao) + '</div>' },
    { id: 'docs', label: 'Documentos', render: () => {
      setTimeout(() => { Documentos.render('docs-box', { ait_id: aid }); if (cl) Documentos.renderCliente('docs-box-cli-ref', cl.id) }, 0)
      return '<div id="docs-box"></div>' + (cl ? '<div class="section-title" style="margin-top:18px">📎 Documentos do titular</div><div id="docs-box-cli-ref"></div>' : '')
    } },
    { id: 'prazos', label: 'Prazos & histórico', render: () =>
      '<div class="field-grid">' + field('Vencimento do recurso', Data.fmtData(a.vencimento)) + field('Próxima etapa', Data.proximaEtapa(a) || '—') +
      field('Última atualização', a.ultima_att) + field('Data da venda', Data.fmtData(a.data_venda)) + '</div>' },
    { id: 'financeiro', label: 'Financeiro', render: () =>
      '<div class="field-grid">' + field('Valor do serviço', a.valor ? Data.fmtMoeda(a.valor) : '—') + field('Pagamento', a.pagamento) + field('Data da venda', Data.fmtData(a.data_venda)) + '</div>' },
    { id: 'editar', label: 'Editar', render: () => {
      setTimeout(() => {
        const sv = document.getElementById('ait-save-btn'); if (sv) sv.onclick = () => salvarEdicaoAIT(aid)
        const dl = document.getElementById('ait-del-btn'); if (dl) dl.onclick = () => excluirAIT(aid)
      }, 0)
      return '<div class="form-row" style="margin-bottom:8px">' +
        '<div><label class="form-label">Código da AIT</label><input class="form-ctrl" id="ed-codigo" value="' + (a.codigo || '') + '"></div>' +
        '<div><label class="form-label">Enquadramento</label><input class="form-ctrl" id="ed-enq" value="' + (a.enquadramento || '') + '"></div></div>' +
        '<div class="form-row" style="margin-bottom:8px">' +
        '<div><label class="form-label">Protocolo</label><input class="form-ctrl" id="ed-proto" value="' + (a.protocolo || '') + '"></div>' +
        '<div><label class="form-label">Senha</label><input class="form-ctrl" id="ed-senha" value="' + (a.senha || '') + '"></div></div>' +
        '<div class="form-row3" style="margin-bottom:8px">' +
        '<div><label class="form-label">Defesa Prévia</label>' + UI.etapaSelect('ed-def', a.defesa_previa) + '</div>' +
        '<div><label class="form-label">JARI</label>' + UI.etapaSelect('ed-jari', a.jari) + '</div>' +
        '<div><label class="form-label">2ª Instância</label>' + UI.etapaSelect('ed-seg', a.segunda_instancia) + '</div></div>' +
        '<div class="form-row" style="margin-bottom:8px">' +
        '<div><label class="form-label">Vencimento do recurso</label><input type="date" class="form-ctrl" id="ed-venc" value="' + (a.vencimento || '') + '"></div>' +
        '<div><label class="form-label">Data da venda</label><input type="date" class="form-ctrl" id="ed-dvenda" value="' + (a.data_venda || '') + '"></div></div>' +
        '<div class="form-row" style="margin-bottom:12px">' +
        '<div><label class="form-label">Valor (R$)</label><input type="number" step="0.01" class="form-ctrl" id="ed-valor" value="' + (a.valor || '') + '"></div>' +
        '<div><label class="form-label">Observação</label><input class="form-ctrl" id="ed-obs" value="' + (a.observacao || '') + '"></div></div>' +
        '<button class="btn btn-primary" id="ait-save-btn">Salvar alterações</button>' +
        '<button class="btn btn-danger" id="ait-del-btn" style="margin-left:8px">Excluir AIT</button>'
    } }
  ]
  UI.tabs(header, abas, 'info')
}

async function salvarEdicaoAIT(aid) {
  const a = Data.gAIT(aid); if (!a) return
  const fields = {
    codigo:             document.getElementById('ed-codigo').value.trim().toUpperCase() || a.codigo,
    enquadramento:      document.getElementById('ed-enq').value.trim(),
    protocolo:          document.getElementById('ed-proto').value.trim(),
    senha:              document.getElementById('ed-senha').value.trim(),
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
    // Recarregar do banco para garantir que o cache reflete o estado real
    const fresh = await API.getAITs()
    Data.load({ clientes: Data.getClientes(), placas: Data.getPlacas(), aits: fresh })
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
    <div class="info-box blue" style="margin-bottom:14px">Ao confirmar, <strong>${prox}</strong> será marcado como <strong>Aguardando</strong> e o prazo atual será limpo.</div>
    <div class="form-group" style="margin-bottom:14px">
      <label class="form-label">Observação</label>
      <input class="form-ctrl" id="rv-obs" value="${a.observacao || ''}" style="font-size:12px">
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="confirmarRecurso('${aid}','${etKey}')">✓ Recurso protocolado</button>
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
    </div>`
  )
}

async function confirmarRecurso(aid, etKey) {
  const a = Data.gAIT(aid); if (!a) return
  const fields = { [etKey]: 'Aguardando', vencimento: null, ultima_att: Data.today() }
  const obs = document.getElementById('rv-obs'); if (obs) fields.observacao = obs.value
  try {
    await API.updateAIT(aid, fields)
    Data.updateAITCache(aid, fields)
    UI.updateStats()
    UI.closeModal()
    renderRecursos()
    UI.notif('Recurso protocolado — AIT voltou para verificação!')
  } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
}

function openRecursoSus(sid) {
  const s = Suspensoes.getById(sid); if (!s) return
  const cl = Data.gCliente(s.cliente_id)
  const prox = Suspensoes.proximaEtapa(s)
  const ant = prox === 'Defesa Prévia' ? '—' : prox === 'JARI' ? 'Defesa Prévia' : 'JARI'
  const etKey = prox === 'Defesa Prévia' ? 'defesa_previa' : prox === 'JARI' ? 'jari' : 'cetran'
  UI.openModal(
    `<div class="modal-title">Protocolar recurso — Suspensão de CNH</div>
    <div class="modal-sub">${cl ? cl.nome : '—'} · Processo ${s.processo || '—'}</div>
    <div class="field-grid" style="margin:14px 0">
      <div class="field"><div class="field-label">${ant} (anterior)</div><div class="field-val" style="color:var(--red)">Indeferido</div></div>
      <div class="field"><div class="field-label">Recurso a fazer</div><div class="field-val" style="color:var(--blue);font-weight:500">${prox}</div></div>
      ${s.protocolo ? `<div class="field"><div class="field-label">Protocolo</div><div class="field-val mono">${s.protocolo}</div></div>` : ''}
      ${s.senha ? `<div class="field"><div class="field-label">Senha</div><div class="field-val mono">${s.senha}</div></div>` : ''}
    </div>
    <div class="info-box blue" style="margin-bottom:14px">Ao confirmar, <strong>${prox}</strong> será marcado como <strong>Aguardando</strong> e o prazo atual será limpo.</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="Suspensoes.confirmarRecurso('${sid}','${etKey}')">✓ Recurso protocolado</button>
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
    </div>`
  )
}

// ─── EXCLUSÕES ───────────────────────────────────────────────
async function excluirAIT(aid) {
  if (!confirm('Excluir esta AIT? Esta ação não pode ser desfeita.')) return
  try {
    const { error } = await Auth.getClient().from('aits').delete().eq('id', aid)
    if (error) throw error
    // Remover do cache local
    const aits = Data.getAITs()
    const idx = aits.findIndex(a => a.id === aid)
    if (idx >= 0) aits.splice(idx, 1)
    UI.updateStats()
    UI.closeModal()
    renderAITs(1)
    UI.notif('AIT excluída!')
  } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
}

async function excluirPlaca(pid, cid) {
  // Verificar se tem AITs vinculadas
  const aitsVinculadas = Data.aitsDaPlaca(pid)
  if (aitsVinculadas.length > 0) {
    alert('Não é possível excluir esta placa pois ela possui ' + aitsVinculadas.length + ' AIT(s) vinculada(s). Exclua as AITs primeiro.')
    return
  }
  if (!confirm('Excluir esta placa? Esta ação não pode ser desfeita.')) return
  try {
    const { error } = await Auth.getClient().from('placas').delete().eq('id', pid)
    if (error) throw error
    // Remover do cache local
    const placas = Data.getPlacas()
    const idx = placas.findIndex(p => p.id === pid)
    if (idx >= 0) placas.splice(idx, 1)
    UI.closeModal()
    UI.notif('Placa excluída!')
  } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
}

async function excluirCliente(cid) {
  // Verificar se tem placas ou AITs vinculadas
  const placasVinculadas = Data.placasDe(cid)
  const aitsVinculadas = Data.aitsDe(cid)
  if (placasVinculadas.length > 0 || aitsVinculadas.length > 0) {
    alert('Não é possível excluir este cliente pois ele possui ' +
      placasVinculadas.length + ' placa(s) e ' +
      aitsVinculadas.length + ' AIT(s) vinculada(s).\n\nExclua as AITs e placas primeiro.')
    return
  }
  if (!confirm('Excluir este cliente? Esta ação não pode ser desfeita.')) return
  try {
    const { error } = await Auth.getClient().from('clientes').delete().eq('id', cid)
    if (error) throw error
    // Remover do cache local
    const clientes = Data.getClientes()
    const idx = clientes.findIndex(c => c.id === cid)
    if (idx >= 0) clientes.splice(idx, 1)
    UI.updateStats()
    UI.closeModal()
    renderClientes(1)
    UI.notif('Cliente excluído!')
  } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
}

// ─── EXPORTAÇÃO EXCEL ────────────────────────────────────────
function exportarAITs() {
  const aits = Data.getAITs()
  const rows = [
    ['Cliente', 'Placa', 'Renavan', 'Código AIT', 'Enquadramento', 'Protocolo', 'Senha',
     'Ano', 'Defesa Prévia', 'JARI', '2ª Instância', 'Etapa Atual', 'Status',
     'Vencimento Recurso', 'Data Venda', 'Valor (R$)', 'Pagamento',
     'Última Atualização', 'Encerrado', 'Observação']
  ]
  aits.forEach(a => {
    const pl = Data.gPlaca(a.placa_id)
    const cl = pl ? Data.gCliente(pl.cliente_id) : null
    rows.push([
      cl ? cl.nome : '',
      pl ? pl.placa : '',
      pl ? pl.renavan : '',
      a.codigo || '',
      a.enquadramento || '',
      a.protocolo || '',
      a.senha || '',
      a.ano || '',
      a.defesa_previa || '',
      a.jari || '',
      a.segunda_instancia || '',
      Data.etapaAtual(a),
      Data.statusAtual(a),
      a.vencimento || '',
      a.data_venda || '',
      a.valor || 0,
      a.pagamento || 'Pendente',
      a.ultima_att || '',
      a.encerrado ? 'Sim' : 'Não',
      a.observacao || ''
    ])
  })
  downloadExcel(rows, 'AITs_ZeroPontos_' + Data.today() + '.xlsx')
  UI.notif('Exportando ' + aits.length + ' AITs...')
}

function exportarSuspensoes() {
  // Pegar dados direto do Supabase
  Auth.getClient()
    .from('suspensoes')
    .select('*, clientes(nome, contato, email)')
    .order('ano', { ascending: false })
    .then(({ data, error }) => {
      if (error) { UI.notif('Erro ao exportar: ' + error.message, 'error'); return }
      const rows = [
        ['Cliente', 'Processo', 'Protocolo', 'Senha', 'Ano',
         'Defesa Prévia', 'JARI', 'CETRAN',
         'Vencimento JARI', 'Vencimento CETRAN',
         'Etapa Atual', 'Status', 'Última Atualização', 'Encerrado', 'Observação']
      ]
      data.forEach(s => {
        const nome = s.clientes ? s.clientes.nome : ''
        const et = Suspensoes ? calcEtapaSus(s) : ''
        rows.push([
          nome,
          s.processo || '',
          s.protocolo || '',
          s.senha || '',
          s.ano || '',
          s.defesa_previa || '',
          s.jari || '',
          s.cetran || '',
          s.vencimento_jari || '',
          s.vencimento_cetran || '',
          et,
          calcStatusSus(s),
          s.ultima_att || '',
          s.encerrado ? 'Sim' : 'Não',
          s.observacao || ''
        ])
      })
      downloadExcel(rows, 'Suspensoes_ZeroPontos_' + Data.today() + '.xlsx')
      UI.notif('Exportando ' + data.length + ' suspensões...')
    })
}

function oQueFazer(precisa, prox, prazo) {
  if (!precisa) return 'Aguardando decisão — nenhuma ação necessária no momento'
  return prazo
    ? `⚠ Protocolar recurso na ${prox} até ${Data.fmtData(prazo)}`
    : `⚠ Protocolar recurso na ${prox} — prazo a definir`
}

async function gerarRelatorioCliente(cid) {
  const c = Data.gCliente(cid); if (!c) return
  await Suspensoes.garantirCarregado()

  const aitsAll = Data.aitsDe(cid)
  const ativas = aitsAll.filter(a => !a.encerrado)
  const encerradas = aitsAll.filter(a => a.encerrado)
  const deferidas = encerradas.filter(a => Data.statusAtual(a) === 'Deferido').length
  const indeferidas = encerradas.filter(a => Data.statusAtual(a) === 'Indeferido').length
  const susAtivas = Suspensoes.getLista().filter(s => s.cliente_id === cid && !s.encerrado)

  const rows = []
  rows.push(['Relatório — ' + c.nome])
  rows.push(['Gerado em: ' + Data.fmtData(Data.today())])

  if (!ativas.length && !encerradas.length && !susAtivas.length) {
    rows.push([])
    rows.push(['Nenhuma AIT ou suspensão vinculada a este cliente.'])
  } else {
    rows.push([])
    rows.push(['AITs em andamento'])
    rows.push(['Código', 'Enquadramento', 'Placa', 'Etapa atual', 'Status', 'Prazo', 'O que fazer'])
    if (ativas.length) {
      ativas.forEach(a => {
        const pl = Data.gPlaca(a.placa_id)
        rows.push([
          a.codigo, a.enquadramento || '—', pl ? pl.placa : '—',
          Data.etapaAtual(a), Data.statusAtual(a), a.vencimento ? Data.fmtData(a.vencimento) : '—',
          oQueFazer(Data.precisaRecurso(a), Data.proximaEtapa(a), a.vencimento)
        ])
      })
    } else {
      rows.push(['Nenhuma AIT em andamento no momento.'])
    }

    rows.push([])
    rows.push(['Resumo de AITs encerradas'])
    rows.push(['Resultado', 'Quantidade'])
    rows.push(['Deferidas', deferidas])
    rows.push(['Indeferidas', indeferidas])

    if (susAtivas.length) {
      rows.push([])
      rows.push(['Suspensão de CNH'])
      rows.push(['Processo', 'Etapa atual', 'Status', 'Prazo', 'O que fazer'])
      susAtivas.forEach(s => {
        const prox = Suspensoes.proximaEtapa(s)
        const prazo = prox === 'JARI' ? s.vencimento_jari : s.vencimento_cetran
        rows.push([
          s.processo || '—', Suspensoes.etapaAtual(s), Suspensoes.statusAtual(s),
          prazo ? Data.fmtData(prazo) : '—',
          oQueFazer(Suspensoes.precisaRecurso(s), prox, prazo)
        ])
      })
    }
  }

  const nomeArquivo = 'Relatorio_' +
    c.nome.replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_') +
    '_' + Data.today() + '.xlsx'
  downloadExcel(rows, nomeArquivo)
  UI.notif('Relatório de ' + c.nome + ' gerado!')
}

function calcEtapaSus(s) {
  if (s.encerrado) return 'Encerrado'
  if (!s.defesa_previa || s.defesa_previa === 'Aguardando' || s.defesa_previa === 'Não realizado') return 'Defesa Prévia'
  if (s.defesa_previa === 'Deferido') return 'Encerrado'
  if (s.defesa_previa === 'Indeferido') {
    if (!s.jari || s.jari === 'Aguardando' || s.jari === 'Não realizado') return 'JARI'
    if (s.jari === 'Deferido') return 'Encerrado'
    if (s.jari === 'Indeferido') return s.cetran ? 'CETRAN' : 'CETRAN'
  }
  return 'Defesa Prévia'
}

function calcStatusSus(s) {
  const et = calcEtapaSus(s)
  if (et === 'Defesa Prévia') return s.defesa_previa || 'Aguardando'
  if (et === 'JARI')         return s.jari          || 'Aguardando'
  if (et === 'CETRAN')       return s.cetran         || 'Aguardando'
  if (et === 'Encerrado') {
    if (s.defesa_previa==='Deferido'||s.jari==='Deferido'||s.cetran==='Deferido') return 'Deferido'
    return 'Indeferido'
  }
  return 'Aguardando'
}

function downloadExcel(rows, filename) {
  // Gerar CSV como fallback caso SheetJS não esteja disponível
  // Mas usar SheetJS se disponível via CDN
  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rows)
    // Largura automática das colunas
    const colWidths = rows[0].map((_, ci) => ({
      wch: Math.max(...rows.map(r => String(r[ci] || '').length), 10)
    }))
    ws['!cols'] = colWidths
    XLSX.utils.book_append_sheet(wb, ws, 'Dados')
    XLSX.writeFile(wb, filename)
  } else {
    // Fallback: CSV
    const csv = rows.map(r =>
      r.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')
    ).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.replace('.xlsx', '.csv')
    a.click()
    URL.revokeObjectURL(url)
  }
}
