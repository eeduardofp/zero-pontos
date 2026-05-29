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

  function modalClickBg(e) {
    if (e.target === document.getElementById('modal')) closeModal()
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

  return {
    badge, etClass, renderPager, notif,
    openModal, closeModal, modalClickBg,
    setLoading, acBuild, etapaSelect,
    updateStats, setFiltro
  }
})()
