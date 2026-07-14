// ─── CALENDÁRIO ───────────────────────────────────────────────
// Vencimentos automáticos (AITs/suspensões) + compromissos manuais.
const Calendario = (() => {
  let eventos = []
  let ref = new Date()
  let carregado = false

  function db() { return Auth.getClient() }
  function genId() { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }
  function iso(d) { return d.toISOString().split('T')[0] }

  async function carregar() {
    eventos = []
    try {
      const { data } = await db().from('compromissos').select('*')
      ;(data || []).forEach(c => eventos.push({ ...c, auto: false }))
    } catch (e) { /* tabela pode não existir ainda */ }
    Data.getAITs().forEach(a => {
      if (a.vencimento && !a.encerrado) eventos.push({ data: a.vencimento, titulo: 'Vence recurso · ' + a.codigo, auto: true, ait_id: a.id })
    })
    if (typeof Suspensoes !== 'undefined') {
      await Suspensoes.garantirCarregado()
      Suspensoes.getLista().forEach(s => {
        if (s.encerrado) return
        if (s.vencimento_jari) eventos.push({ data: s.vencimento_jari, titulo: 'Vence JARI · ' + (s.processo || ''), auto: true, sus_id: s.id })
        if (s.vencimento_cetran) eventos.push({ data: s.vencimento_cetran, titulo: 'Vence CETRAN · ' + (s.processo || ''), auto: true, sus_id: s.id })
      })
    }
    carregado = true
  }

  async function render() {
    if (!carregado) await carregar()
    const ano = ref.getFullYear(), mes = ref.getMonth()
    const primeiro = new Date(ano, mes, 1)
    const inicioSemana = primeiro.getDay() // 0=domingo
    const diasNoMes = new Date(ano, mes + 1, 0).getDate()
    const hojeIso = iso(new Date())

    const cabecalho = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
      .map(d => `<div class="cal-dow">${d}</div>`).join('')

    let celulas = ''
    for (let i = 0; i < inicioSemana; i++) celulas += '<div class="cal-cell cal-empty"></div>'
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const dISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      const doDia = eventos.filter(e => e.data === dISO)
      const evtHtml = doDia.slice(0, 4).map(e => {
        const u = Data.urgLabel(e.data)
        const cls = e.auto ? u.c : 'b-blue'
        const click = e.ait_id ? `openAIT('${e.ait_id}')` : e.sus_id ? `Suspensoes.abrirDetalhe('${e.sus_id}')` : `Calendario.editar('${e.id}')`
        return `<div class="cal-evt ${cls}" title="${e.titulo.replace(/"/g, '')}" onclick="event.stopPropagation();${click}">${(e.hora ? e.hora + ' ' : '') + e.titulo}</div>`
      }).join('') + (doDia.length > 4 ? `<div class="cal-more">+${doDia.length - 4}</div>` : '')
      celulas += `<div class="cal-cell${dISO === hojeIso ? ' cal-today' : ''}" onclick="Calendario.novo('${dISO}')"><div class="cal-num">${dia}</div>${evtHtml}</div>`
    }

    const MES = Data.MESES[mes]
    document.getElementById('calendario-root').innerHTML =
      `<div class="page-header"><div><div class="page-title">Calendário</div><div class="page-sub">Vencimentos e compromissos</div></div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="Calendario.mes(-1)">‹</button>
          <span style="font-weight:600;min-width:150px;text-align:center">${MES} ${ano}</span>
          <button class="btn btn-ghost btn-sm" onclick="Calendario.mes(1)">›</button>
          <button class="btn btn-ghost btn-sm" onclick="Calendario.hoje()">Hoje</button>
          <button class="btn btn-primary btn-sm" onclick="Calendario.novo('${hojeIso}')">+ Compromisso</button>
        </div></div>
       <div class="cal-grid cal-head">${cabecalho}</div>
       <div class="cal-grid cal-body">${celulas}</div>`
  }

  function mes(delta) { ref = new Date(ref.getFullYear(), ref.getMonth() + delta, 1); render() }
  function hoje() { ref = new Date(); render() }

  function novo(dataISO) {
    UI.openModal(
      '<div class="modal-title">Novo compromisso</div><div class="modal-sub">' + Data.fmtData(dataISO) + '</div>' +
      '<div class="form-group" style="margin-top:12px"><label class="form-label">Tipo</label><select class="form-ctrl" id="k-tipo"><option value="reuniao">Reunião</option><option value="protocolo">Protocolo agendado</option><option value="lembrete">Lembrete</option></select></div>' +
      '<div class="form-group"><label class="form-label">Título</label><input class="form-ctrl" id="k-titulo" placeholder="Ex.: Reunião com cliente"></div>' +
      '<div class="form-row"><div><label class="form-label">Data</label><input type="date" class="form-ctrl" id="k-data" value="' + dataISO + '"></div>' +
      '<div><label class="form-label">Hora</label><input class="form-ctrl" id="k-hora" placeholder="14:00"></div></div>' +
      '<div class="form-group"><label class="form-label">Observação</label><input class="form-ctrl" id="k-obs"></div>' +
      '<button class="btn btn-primary" id="k-save">Salvar</button>'
    )
    document.getElementById('k-save').onclick = () => salvar(null)
  }

  function editar(id) {
    const c = eventos.find(e => e.id === id); if (!c) return
    UI.openModal(
      '<div class="modal-title">Editar compromisso</div>' +
      '<div class="form-group" style="margin-top:12px"><label class="form-label">Tipo</label><select class="form-ctrl" id="k-tipo">' +
      ['reuniao', 'protocolo', 'lembrete'].map(t => `<option value="${t}"${c.tipo === t ? ' selected' : ''}>${t}</option>`).join('') + '</select></div>' +
      '<div class="form-group"><label class="form-label">Título</label><input class="form-ctrl" id="k-titulo" value="' + (c.titulo || '') + '"></div>' +
      '<div class="form-row"><div><label class="form-label">Data</label><input type="date" class="form-ctrl" id="k-data" value="' + (c.data || '') + '"></div>' +
      '<div><label class="form-label">Hora</label><input class="form-ctrl" id="k-hora" value="' + (c.hora || '') + '"></div></div>' +
      '<div class="form-group"><label class="form-label">Observação</label><input class="form-ctrl" id="k-obs" value="' + (c.observacao || '') + '"></div>' +
      '<button class="btn btn-primary" id="k-save">Salvar</button>' +
      '<button class="btn btn-danger" id="k-del" style="margin-left:8px">Excluir</button>'
    )
    document.getElementById('k-save').onclick = () => salvar(id)
    document.getElementById('k-del').onclick = () => excluir(id)
  }

  async function salvar(id) {
    const titulo = document.getElementById('k-titulo').value.trim()
    if (!titulo) { UI.notif('Informe o título', 'error'); return }
    const obj = {
      tipo: document.getElementById('k-tipo').value,
      titulo,
      data: document.getElementById('k-data').value,
      hora: document.getElementById('k-hora').value.trim() || null,
      observacao: document.getElementById('k-obs').value.trim() || null
    }
    try {
      if (id) await db().from('compromissos').update(obj).eq('id', id)
      else await db().from('compromissos').insert({ id: genId(), ...obj })
      UI.closeModal(); carregado = false; await render()
      UI.notif('Compromisso salvo!')
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  async function excluir(id) {
    if (!confirm('Excluir este compromisso?')) return
    try {
      await db().from('compromissos').delete().eq('id', id)
      UI.closeModal(); carregado = false; await render()
      UI.notif('Compromisso excluído')
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  return { render, carregar, mes, hoje, novo, editar }
})()
