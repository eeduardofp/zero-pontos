// ─── UI ──────────────────────────────────────────────────────
// Componentes de interface reutilizáveis
const UI = (() => {

  // ── BADGES ───────────────────────────────────────────────
  function badge(s) {
    if (!s || s === '') return '<span class="badge b-na">—</span>'
    const cls = s === 'Aguardando' ? 'b-wait'
              : s === 'Deferido'   ? 'b-ok'
              : s === 'Indeferido' ? 'b-no'
              : 'b-na'
    return `<span class="badge ${cls}">${s}</span>`
  }

  function etClass(s) {
    if (s === 'Deferido')   return 'ok'
    if (s === 'Indeferido') return 'no'
    if (s === 'Aguardando') return 'wait'
    return 'na'
  }

  // ── PAGINAÇÃO ─────────────────────────────────────────────
  const _pagerCbs = {}

  function renderPager(id, cur, total, cb) {
    const el = document.getElementById(id)
    if (!el) return
    if (total <= 1) { el.innerHTML = ''; return }
    _pagerCbs[id] = cb
    window._pagerGo = function(pid, p) { if (_pagerCbs[pid]) _pagerCbs[pid](p) }
    let h = ''
    if (cur > 1) h += `<button onclick="_pagerGo('${id}',${cur - 1})">‹</button>`
    const s = Math.max(1, cur - 2), e = Math.min(total, cur + 2)
    for (let i = s; i <= e; i++) h += `<button class="${i === cur ? 'on' : ''}" onclick="_pagerGo('${id}',${i})">${i}</button>`
    if (cur < total) h += `<button onclick="_pagerGo('${id}',${cur + 1})">›</button>`
    h += `<span class="info">${cur}/${total}</span>`
    el.innerHTML = h
  }

  // ── NOTIFICAÇÃO ───────────────────────────────────────────
  function notif(msg, type) {
    const n = document.createElement('div')
    n.className = 'notif' + (type === 'error' ? ' notif-error' : '')
    n.textContent = msg
    document.body.appendChild(n)
    setTimeout(() => n.remove(), 2800)
  }

  // ── MODAL ─────────────────────────────────────────────────
  function openModal(html) {
    document.getElementById('modal-body').innerHTML = html
    document.getElementById('modal').classList.add('open')
  }

  function closeModal() {
    document.getElementById('modal').classList.remove('open')
    document.getElementById('modal-body').innerHTML = ''
  }

  // Só fecha se o clique COMEÇOU no fundo (evita fechar ao soltar o mouse no
  // fundo depois de interagir com select/input dentro do modal).
  let _downOnBg = false
  function modalMouseDown(e) {
    _downOnBg = e.target === document.getElementById('modal')
  }
  function modalClickBg(e) {
    if (_downOnBg && e.target === document.getElementById('modal')) closeModal()
    _downOnBg = false
  }

  // ── LOADING ───────────────────────────────────────────────
  function setLoading(show) {
    const el = document.getElementById('loading-overlay')
    if (el) el.style.display = show ? 'flex' : 'none'
  }

  // ── AUTOCOMPLETE ──────────────────────────────────────────
  function acBuild(listId, q, clientes, onSelect) {
    const el = document.getElementById(listId)
    if (!el) return
    el.innerHTML = ''
    const sorted = [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const filtered = q
      ? sorted.filter(c => c.nome.toLowerCase().includes(q.toLowerCase()))
      : sorted
    const slice = filtered.slice(0, 30)
    if (!slice.length) {
      const none = document.createElement('div')
      none.className = 'ac-item'
      none.style.color = 'var(--text3)'
      none.textContent = 'Nenhum resultado'
      el.appendChild(none)
      return
    }
    slice.forEach(c => {
      const item = document.createElement('div')
      item.className = 'ac-item'
      let nome = c.nome
      if (q) {
        const pos = nome.toLowerCase().indexOf(q.toLowerCase())
        if (pos >= 0) nome = nome.slice(0, pos) + '<mark>' + nome.slice(pos, pos + q.length) + '</mark>' + nome.slice(pos + q.length)
      }
      item.innerHTML = nome
      item.addEventListener('mousedown', ev => {
        ev.preventDefault()
        onSelect(c)
      })
      el.appendChild(item)
    })
  }

  // ── SELECTS DE ETAPA ─────────────────────────────────────
  function etapaSelect(id, value) {
    const opts = ['', 'Aguardando', 'Deferido', 'Indeferido', 'Não realizado']
      .map(v => `<option value="${v}" ${value === v ? 'selected' : ''}>${v || '—'}</option>`)
      .join('')
    return `<select class="form-ctrl" id="${id}" style="font-size:12px">${opts}</select>`
  }

  // ── SIDEBAR STATS ─────────────────────────────────────────
  function updateStats() {
    const aits = Data.getAITs()
    const ativas = aits.filter(a => !a.encerrado).length
    const urg = aits.filter(a => !a.encerrado && Data.daysSince(a.ultima_att) >= 21).length
    const rec = aits.filter(Data.precisaRecurso).length
    const el = document.getElementById('sidebar-stats')
    if (el) el.innerHTML =
      `${Data.getClientes().length} clientes\n${aits.length} AITs\n${ativas} ativas\n${urg} p/ verificar\n${rec} recursos pend.`
  }

  // ── FILTRO HELPERS ────────────────────────────────────────
  function setFiltro(btn, hiddenId, val, cb) {
    document.getElementById(hiddenId).value = val
    btn.closest('.filters').querySelectorAll('.fbtn').forEach(b => b.classList.remove('on'))
    btn.classList.add('on')
    if (cb) cb()
  }

  // ── DETALHE COM ABAS ──────────────────────────────────────
  // abas = [{id, label, badge?, render:()=>htmlString}]
  let _tabs = []
  function tabs(headerHtml, abas, ativa) {
    _tabs = abas
    const at = ativa || (abas[0] && abas[0].id)
    const navHtml = abas.map(a =>
      `<div class="tab${a.id === at ? ' on' : ''}" data-tab="${a.id}" onclick="UI._tabGo('${a.id}')">${a.label}${a.badge != null ? ` <span class="cnt">${a.badge}</span>` : ''}</div>`
    ).join('')
    const corpo = (abas.find(a => a.id === at) || abas[0]).render()
    openModal(`<div class="detail">${headerHtml}<div class="tabs">${navHtml}</div><div id="tab-body" class="panel">${corpo}</div></div>`)
  }
  function _tabGo(id) {
    document.querySelectorAll('#modal .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === id))
    const a = (_tabs || []).find(x => x.id === id)
    if (a) document.getElementById('tab-body').innerHTML = a.render()
  }

  // ── EDIÇÃO INLINE ─────────────────────────────────────────
  // Troca o conteúdo de `el` por um input/select; Enter/blur salva, Esc cancela.
  // onSave(novoValor) deve persistir e retornar Promise.
  function inlineEdit(el, valorAtual, onSave, opts) {
    opts = opts || {}
    const antigo = el.innerHTML
    const inp = document.createElement(opts.tipo === 'select' ? 'select' : 'input')
    if (opts.tipo === 'select') {
      (opts.opcoes || []).forEach(o => { const op = document.createElement('option'); op.value = o; op.textContent = o || '—'; if (o === valorAtual) op.selected = true; inp.appendChild(op) })
    } else {
      inp.type = opts.tipo || 'text'
      inp.value = valorAtual == null ? '' : valorAtual
    }
    inp.className = 'form-ctrl'
    inp.style.fontSize = '13px'
    el.innerHTML = ''
    el.appendChild(inp)
    inp.focus()
    let done = false
    const salvar = async () => {
      if (done) return
      done = true
      let v = inp.value
      if (opts.upper) v = v.toUpperCase()
      if (opts.trim !== false) v = typeof v === 'string' ? v.trim() : v
      try { await onSave(v) } catch (e) { UI.notif('Erro: ' + e.message, 'error'); el.innerHTML = antigo }
    }
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') salvar()
      if (e.key === 'Escape') { done = true; el.innerHTML = antigo }
    })
    inp.addEventListener('blur', salvar)
  }

  // ── TEMA CLARO/ESCURO ─────────────────────────────────────
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('zp-theme', t)
    const b = document.getElementById('theme-btn')
    if (b) b.textContent = t === 'dark' ? '☀️' : '🌙'
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    applyTheme(cur === 'dark' ? 'light' : 'dark')
  }
  function initTheme() {
    applyTheme(localStorage.getItem('zp-theme') || 'light')
  }

  return {
    badge, etClass, renderPager, notif,
    openModal, closeModal, modalClickBg, modalMouseDown,
    setLoading, acBuild, etapaSelect,
    updateStats, setFiltro,
    applyTheme, toggleTheme, initTheme,
    tabs, _tabGo, inlineEdit
  }
})()
