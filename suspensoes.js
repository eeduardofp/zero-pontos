// ─── SUSPENSÕES ──────────────────────────────────────────────
const Suspensoes = (() => {
  let lista = []
  let pagina = 1
  const POR_PAGINA = 30
  let sortCol = 'ultima_att'
  let sortDir = 'desc'

  // ── SUPABASE ──────────────────────────────────────────────
  function db() { return Auth.getClient() }

  async function loadSuspensoes() {
    const { data, error } = await db()
      .from('suspensoes')
      .select('*, clientes(nome, contato, email)')
      .order('ano', { ascending: false })
    if (error) throw error
    lista = data
    return data
  }

  async function updateSuspensao(id, fields) {
    const { data, error } = await db()
      .from('suspensoes')
      .update(fields)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const idx = lista.findIndex(s => s.id === id)
    if (idx >= 0) lista[idx] = { ...lista[idx], ...data }
    return data
  }

  async function createSuspensao(obj) {
    const { data, error } = await db()
      .from('suspensoes')
      .insert(obj)
      .select('*, clientes(nome, contato, email)')
      .single()
    if (error) throw error
    lista.unshift(data)
    return data
  }

  function gSus(id) { return lista.find(s => s.id === id) || null }

  // ── LÓGICA ────────────────────────────────────────────────
  function etapaAtual(s) {
    if (s.encerrado) return 'Encerrado'
    if (!s.defesa_previa || s.defesa_previa === 'Aguardando' || s.defesa_previa === 'Não realizado') return 'Defesa Prévia'
    if (s.defesa_previa === 'Deferido') return 'Encerrado'
    if (s.defesa_previa === 'Indeferido') {
      if (!s.jari || s.jari === 'Aguardando' || s.jari === 'Não realizado') return 'JARI'
      if (s.jari === 'Deferido') return 'Encerrado'
      if (s.jari === 'Indeferido') {
        if (!s.cetran || s.cetran === 'Aguardando' || s.cetran === 'Não realizado') return 'CETRAN'
        return 'Encerrado'
      }
    }
    return 'Defesa Prévia'
  }

  function statusAtual(s) {
    const et = etapaAtual(s)
    if (et === 'Defesa Prévia') return s.defesa_previa || 'Aguardando'
    if (et === 'JARI')         return s.jari          || 'Aguardando'
    if (et === 'CETRAN')       return s.cetran         || 'Aguardando'
    if (et === 'Encerrado') {
      if (s.defesa_previa === 'Deferido' || s.jari === 'Deferido' || s.cetran === 'Deferido') return 'Deferido'
      return 'Indeferido'
    }
    return 'Aguardando'
  }

  function deveEncerrar(s) {
    return s.defesa_previa === 'Deferido' || s.jari === 'Deferido' ||
           s.cetran === 'Deferido' || s.cetran === 'Indeferido' || s.cetran === 'Encerrado'
  }

  // Só entra como pendência quando a etapa anterior está indeferida E o prazo
  // da próxima etapa é conhecido (senão a automação ainda não trouxe a data
  // do site — não faz sentido cobrar protocolo sem prazo real).
  function precisaRecurso(s) {
    if (s.encerrado) return false
    const defInd = s.defesa_previa === 'Indeferido'
    const jariVaz = !s.jari || s.jari === 'Não realizado'
    const jariInd = s.jari === 'Indeferido'
    const cetranVaz = !s.cetran || s.cetran === 'Não realizado'
    if (defInd && jariVaz) return !!s.vencimento_jari
    if (jariInd && cetranVaz) return !!s.vencimento_cetran
    return false
  }

  function proximaEtapa(s) {
    if (s.defesa_previa === 'Indeferido' && (!s.jari || s.jari === 'Não realizado')) return 'JARI'
    if (s.jari === 'Indeferido' && (!s.cetran || s.cetran === 'Não realizado')) return 'CETRAN'
    return null
  }

  function getLista() { return lista }

  async function garantirCarregado() {
    if (!lista.length) await loadSuspensoes()
  }

  function getById(id) { return gSus(id) }

  function nomeCliente(s) {
    return s.clientes ? s.clientes.nome : '—'
  }

  // ── RENDER ────────────────────────────────────────────────
  async function render() {
    UI.setLoading(true)
    try {
      await loadSuspensoes()
    } catch(e) {
      UI.notif('Erro ao carregar suspensões: ' + e.message, 'error')
    } finally {
      UI.setLoading(false)
    }
    renderLista()
  }

  function sortBy(col) {
    if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    else { sortCol = col; sortDir = col === 'ultima_att' ? 'desc' : 'asc' }
    renderLista()
  }

  function sortIcon(col) {
    if (sortCol !== col) return '<span style="color:var(--text3);margin-left:4px">↕</span>'
    return '<span style="color:var(--blue);margin-left:4px">' + (sortDir === 'asc' ? '↑' : '↓') + '</span>'
  }

  function vencimentoAtual(s) {
    // Retorna o vencimento mais relevante baseado na etapa atual
    const et = etapaAtual(s)
    if (et === 'CETRAN' && s.vencimento_cetran) return s.vencimento_cetran
    if (et === 'JARI' && s.vencimento_jari) return s.vencimento_jari
    if (s.vencimento_cetran) return s.vencimento_cetran
    if (s.vencimento_jari) return s.vencimento_jari
    return null
  }

  function renderLista(p) {
    if (p) pagina = p
    const q = (document.getElementById('sus-q') || {}).value || ''
    const st = (document.getElementById('sus-status') || {}).value || 'todos'
    const ano = (document.getElementById('sus-ano') || {}).value || 'todos'

    let filtrada = lista.filter(s => {
      if (st === 'ativo' && s.encerrado) return false
      if (st === 'encerrado' && !s.encerrado) return false
      if (st === 'Aguardando' && statusAtual(s) !== 'Aguardando') return false
      if (st === 'Indeferido' && statusAtual(s) !== 'Indeferido') return false
      if (st === 'Deferido'   && statusAtual(s) !== 'Deferido')   return false
      if (ano !== 'todos' && String(s.ano) !== String(ano)) return false
      if (q) {
        const ql = q.toLowerCase()
        const nome = nomeCliente(s).toLowerCase()
        return nome.includes(ql) ||
          (s.processo   || '').toLowerCase().includes(ql) ||
          (s.protocolo  || '').toLowerCase().includes(ql) ||
          (s.senha      || '').toLowerCase().includes(ql) ||
          (s.observacao || '').toLowerCase().includes(ql) ||
          (s.defesa_previa || '').toLowerCase().includes(ql) ||
          (s.jari        || '').toLowerCase().includes(ql) ||
          (s.cetran      || '').toLowerCase().includes(ql)
      }
      return true
    })

    document.getElementById('sus-count').textContent = filtrada.length + ' suspensões'

    // Ordenação
    filtrada.sort((a, b) => {
      let va, vb
      if (sortCol === 'ultima_att') {
        va = a.ultima_att || '0000-00-00'
        vb = b.ultima_att || '0000-00-00'
      } else if (sortCol === 'vencimento') {
        va = vencimentoAtual(a) || '9999-99-99'
        vb = vencimentoAtual(b) || '9999-99-99'
      } else if (sortCol === 'nome') {
        va = nomeCliente(a).toLowerCase()
        vb = nomeCliente(b).toLowerCase()
      } else if (sortCol === 'etapa') {
        const ordem = {'Defesa Prévia':0,'JARI':1,'CETRAN':2,'Encerrado':3}
        va = ordem[etapaAtual(a)] ?? 9
        vb = ordem[etapaAtual(b)] ?? 9
      } else if (sortCol === 'status') {
        const ordem = {'Aguardando':0,'Indeferido':1,'Deferido':2,'Não realizado':3,'Encerrado':4}
        va = ordem[statusAtual(a)] ?? 9
        vb = ordem[statusAtual(b)] ?? 9
      } else if (sortCol === 'ano') {
        va = a.ano || 0
        vb = b.ano || 0
      } else {
        va = (a[sortCol] || '').toString().toLowerCase()
        vb = (b[sortCol] || '').toString().toLowerCase()
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    const total = Math.ceil(filtrada.length / POR_PAGINA) || 1
    if (pagina > total) pagina = 1
    const slice = filtrada.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

    // Atualizar filtros de ano dinamicamente
    const anos = [...new Set(lista.map(s => s.ano).filter(Boolean))].sort().reverse()
    const anoSel = document.getElementById('sus-ano')
    if (anoSel) {
      const curAno = anoSel.value
      anoSel.innerHTML = '<option value="todos">Todos os anos</option>' +
        anos.map(y => '<option value="' + y + '" ' + (curAno === String(y) ? 'selected' : '') + '>' + y + '</option>').join('')
    }

    // Atualizar thead com ícones de ordenação
    const thead = document.querySelector('#pg-suspensoes thead tr')
    if (thead) {
      var cols = [
        {key:'nome',      label:'Cliente',    w:'20%'},
        {key:'processo',  label:'Processo',   w:'100px'},
        {key:'etapa',     label:'Etapa',      w:'90px'},
        {key:'status',    label:'Status',     w:'100px'},
        {key:'ano',       label:'Ano',        w:'55px'},
        {key:'vencimento',label:'Vencimento', w:'90px'},
        {key:'ultima_att',label:'Últ. att.',  w:'80px'}
      ]
      var thHtml = cols.map(function(c) {
        return '<th style="width:' + c.w + ';cursor:pointer" onclick="Suspensoes.sortBy(\'' + c.key + '\')">' + c.label + sortIcon(c.key) + '</th>'
      }).join('') + '<th>Observação</th>'
      thead.innerHTML = thHtml
    }

    const tbody = document.getElementById('sus-tbody')
    if (!slice.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Nenhuma suspensão encontrada</td></tr>'
      UI.renderPager('sus-pager', 1, 1, () => {})
      return
    }

    tbody.innerHTML = slice.map(s => {
      const et = etapaAtual(s)
      const st2 = statusAtual(s)
      const badgeSt = st2 === 'Aguardando' ? '<span class="badge b-wait">Aguardando</span>'
                    : st2 === 'Deferido'   ? '<span class="badge b-ok">Deferido</span>'
                    : st2 === 'Indeferido' ? '<span class="badge b-no">Indeferido</span>'
                    : '<span class="badge b-na">' + st2 + '</span>'
      const diasAtt = s.ultima_att ? Data.daysSince(s.ultima_att) : null
      const attLabel = diasAtt === null ? '<span style="color:var(--text3)">Nunca</span>'
                     : diasAtt === 0    ? '<span style="color:var(--green)">Hoje</span>'
                     : '<span style="color:' + (diasAtt >= 21 ? 'var(--red)' : diasAtt >= 10 ? 'var(--amber)' : 'var(--text3)') + '">' + diasAtt + 'd atrás</span>'

      const venc = vencimentoAtual(s)
      const vencDias = venc ? Data.daysUntil(venc) : null
      const vencLabel = !venc ? '<span style="color:var(--text3)">—</span>'
        : vencDias < 0 ? '<span style="color:var(--red)">' + Data.fmtData(venc) + '</span>'
        : vencDias <= 14 ? '<span style="color:var(--amber)">' + Data.fmtData(venc) + '</span>'
        : '<span style="color:var(--text2)">' + Data.fmtData(venc) + '</span>'

      return '<tr onclick="Suspensoes.abrirDetalhe(\'' + s.id + '\')">' +
        '<td class="bold">' + nomeCliente(s).slice(0, 24) + '</td>' +
        '<td style="font-family:var(--mono);font-size:12px">' + (s.processo || '—') + '</td>' +
        '<td style="font-size:12px">' + et + '</td>' +
        '<td>' + badgeSt + '</td>' +
        '<td style="font-family:var(--mono);color:var(--text3)">' + (s.ano || '—') + '</td>' +
        '<td style="font-size:12px">' + vencLabel + '</td>' +
        '<td style="font-size:12px">' + attLabel + '</td>' +
        '<td style="font-size:12px;color:var(--text3)">' + (s.observacao || '—').slice(0, 25) + '</td>' +
        '</tr>'
    }).join('')

    UI.renderPager('sus-pager', pagina, total, renderLista)
  }

  // ── MODAL DETALHE / EDIÇÃO ────────────────────────────────
  function abrirDetalhe(id) {
    const s = gSus(id); if (!s) return
    const et = etapaAtual(s)
    const da = s.ultima_att ? Data.daysSince(s.ultima_att) : null

    function etapaBox(label, val) {
      const cls = val === 'Deferido' ? 'ok' : val === 'Indeferido' ? 'no' : val === 'Aguardando' ? 'wait' : 'na'
      return '<div class="etapa ' + cls + '"><div class="etapa-label">' + label + '</div><div class="etapa-val">' + (val || '—') + '</div></div>'
    }

    function selOpts(key) {
      const cur = s[key] || ''
      return ['', 'Aguardando', 'Deferido', 'Indeferido', 'Não realizado']
        .map(v => '<option value="' + v + '" ' + (cur === v ? 'selected' : '') + '>' + (v || '—') + '</option>').join('')
    }

    const html = [
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:3px">',
      '<div class="modal-title">' + nomeCliente(s) + '</div>',
      '</div>',
      '<div class="modal-sub">Processo: ' + (s.processo || '—') + ' · Ano: ' + (s.ano || '—') + '</div>',

      '<div class="etapas" style="margin-bottom:16px">',
      etapaBox('Defesa Prévia', s.defesa_previa),
      etapaBox('JARI', s.jari),
      etapaBox('CETRAN', s.cetran),
      '</div>',

      '<div class="section-title" style="margin-bottom:8px">Detalhes</div>',
      '<div class="field-grid" style="margin-bottom:16px">',
      '<div class="field"><div class="field-label">Protocolo</div><div class="field-val mono" style="font-size:11px">' + (s.protocolo || '—') + '</div></div>',
      '<div class="field"><div class="field-label">Senha</div><div class="field-val mono">' + (s.senha || '—') + '</div></div>',
      '<div class="field"><div class="field-label">Etapa atual</div><div class="field-val">' + et + '</div></div>',
      '<div class="field"><div class="field-label">Última atualização</div><div class="field-val">' + (s.ultima_att || '—') + (da !== null ? ' (' + (da === 0 ? 'hoje' : da + 'd atrás') + ')' : '') + '</div></div>',
      '<div class="field"><div class="field-label">Vencimento JARI</div><div class="field-val">' + (s.vencimento_jari ? Data.fmtData(s.vencimento_jari) : '—') + '</div></div>',
      '<div class="field"><div class="field-label">Vencimento CETRAN</div><div class="field-val">' + (s.vencimento_cetran ? Data.fmtData(s.vencimento_cetran) : '—') + '</div></div>',
      '<div class="field" style="grid-column:1/-1"><div class="field-label">Observações</div><div class="field-val">' + (s.observacao || '—') + '</div></div>',
      '</div>',

      '<div class="section-title" style="margin-bottom:10px">Editar</div>',
      '<div class="form-row" style="margin-bottom:8px">',
      '<div><label class="form-label">Processo</label><input class="form-ctrl" id="sus-ed-proc" value="' + (s.processo || '') + '" style="font-size:12px"></div>',
      '<div><label class="form-label">Protocolo</label><input class="form-ctrl" id="sus-ed-proto" value="' + (s.protocolo || '') + '" style="font-size:12px"></div>',
      '</div>',
      '<div class="form-row" style="margin-bottom:8px">',
      '<div><label class="form-label">Senha</label><input class="form-ctrl" id="sus-ed-senha" value="' + (s.senha || '') + '" style="font-size:12px"></div>',
      '<div><label class="form-label">Ano</label><input class="form-ctrl" id="sus-ed-ano" type="number" value="' + (s.ano || '') + '" style="font-size:12px"></div>',
      '</div>',
      '<div class="form-row3" style="margin-bottom:8px">',
      '<div><label class="form-label">Defesa Prévia</label><select class="form-ctrl" id="sus-ed-def" style="font-size:12px">' + selOpts('defesa_previa') + '</select></div>',
      '<div><label class="form-label">JARI</label><select class="form-ctrl" id="sus-ed-jari" style="font-size:12px">' + selOpts('jari') + '</select></div>',
      '<div><label class="form-label">CETRAN</label><select class="form-ctrl" id="sus-ed-cetran" style="font-size:12px">' + selOpts('cetran') + '</select></div>',
      '</div>',
      '<div class="form-row3" style="margin-bottom:8px">',
      '<div><label class="form-label">Vencimento JARI</label><input type="date" class="form-ctrl" id="sus-ed-vjari" value="' + (s.vencimento_jari || '') + '" style="font-size:12px"></div>',
      '<div><label class="form-label">Vencimento CETRAN</label><input type="date" class="form-ctrl" id="sus-ed-vcetran" value="' + (s.vencimento_cetran || '') + '" style="font-size:12px"></div>',
      '<div><label class="form-label">Observação</label><input class="form-ctrl" id="sus-ed-obs" value="' + (s.observacao || '') + '" style="font-size:12px"></div>',
      '</div>',
      '<button class="btn btn-primary" id="sus-save-btn">Salvar alterações</button>'
    ].join('')

    UI.openModal(html)
    document.getElementById('sus-save-btn').onclick = function() { salvarEdicao(id) }
  }

  async function salvarEdicao(id) {
    const s = gSus(id); if (!s) return
    const fields = {
      processo:         document.getElementById('sus-ed-proc').value.trim(),
      protocolo:        document.getElementById('sus-ed-proto').value.trim(),
      senha:            document.getElementById('sus-ed-senha').value.trim(),
      ano:              parseInt(document.getElementById('sus-ed-ano').value) || s.ano,
      defesa_previa:    document.getElementById('sus-ed-def').value || s.defesa_previa,
      jari:             document.getElementById('sus-ed-jari').value || s.jari,
      cetran:           document.getElementById('sus-ed-cetran').value || s.cetran,
      vencimento_jari:  document.getElementById('sus-ed-vjari').value || null,
      vencimento_cetran:document.getElementById('sus-ed-vcetran').value || null,
      observacao:       document.getElementById('sus-ed-obs').value,
      ultima_att:       Data.today()
    }
    if (deveEncerrar({ ...s, ...fields })) fields.encerrado = true
    try {
      await updateSuspensao(id, fields)
      UI.closeModal()
      renderLista()
      UI.notif('Suspensão atualizada!')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  // Protocolar recurso: marca a próxima etapa como Aguardando e limpa o
  // vencimento correspondente (JARI ou CETRAN, conforme etKey).
  async function confirmarRecurso(id, etKey) {
    const s = gSus(id); if (!s) return
    const vencKey = etKey === 'jari' ? 'vencimento_jari' : 'vencimento_cetran'
    const fields = { [etKey]: 'Aguardando', [vencKey]: null, ultima_att: Data.today() }
    try {
      await updateSuspensao(id, fields)
      UI.closeModal()
      if (typeof renderRecursos === 'function') renderRecursos()
      UI.notif('Recurso protocolado — suspensão voltou pra fila de verificação!')
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  // ── MODAL NOVA SUSPENSÃO ──────────────────────────────────
  function abrirNova() {
    const html = [
      '<div class="modal-title">Nova suspensão</div>',
      '<div class="modal-sub">Cadastrar recurso de suspensão de carteira</div>',
      '<div class="form-group" style="margin-top:14px">',
      '<label class="form-label">Cliente</label>',
      '<div class="ac-wrap">',
      '<input class="form-ctrl" id="sus-new-cliente-q" placeholder="Buscar cliente..." oninput="Suspensoes.acFiltrar()" onfocus="Suspensoes.acFiltrar()" onblur="Suspensoes.acFechar()" autocomplete="off" style="font-size:12px">',
      '<input type="hidden" id="sus-new-cliente-val">',
      '<div class="ac-list" id="sus-new-cliente-list"></div>',
      '</div></div>',
      '<div class="form-row" style="margin-bottom:8px">',
      '<div><label class="form-label">Processo</label><input class="form-ctrl" id="sus-new-proc" placeholder="00000/2026" style="font-size:12px"></div>',
      '<div><label class="form-label">Ano</label><input class="form-ctrl" id="sus-new-ano" type="number" value="' + new Date().getFullYear() + '" style="font-size:12px"></div>',
      '</div>',
      '<div class="form-row" style="margin-bottom:8px">',
      '<div><label class="form-label">Protocolo</label><input class="form-ctrl" id="sus-new-proto" style="font-size:12px"></div>',
      '<div><label class="form-label">Senha</label><input class="form-ctrl" id="sus-new-senha" style="font-size:12px"></div>',
      '</div>',
      '<div class="form-row3" style="margin-bottom:8px">',
      '<div><label class="form-label">Defesa Prévia</label><select class="form-ctrl" id="sus-new-def" style="font-size:12px"><option value="Aguardando">Aguardando</option><option value="Deferido">Deferido</option><option value="Indeferido">Indeferido</option><option value="Não realizado">Não realizado</option></select></div>',
      '<div><label class="form-label">JARI</label><select class="form-ctrl" id="sus-new-jari" style="font-size:12px"><option value="">—</option><option value="Aguardando">Aguardando</option><option value="Deferido">Deferido</option><option value="Indeferido">Indeferido</option></select></div>',
      '<div><label class="form-label">CETRAN</label><select class="form-ctrl" id="sus-new-cetran" style="font-size:12px"><option value="">—</option><option value="Aguardando">Aguardando</option><option value="Deferido">Deferido</option><option value="Indeferido">Indeferido</option></select></div>',
      '</div>',
      '<div class="form-row" style="margin-bottom:12px">',
      '<div><label class="form-label">Vencimento JARI</label><input type="date" class="form-ctrl" id="sus-new-vjari" style="font-size:12px"></div>',
      '<div><label class="form-label">Vencimento CETRAN</label><input type="date" class="form-ctrl" id="sus-new-vcetran" style="font-size:12px"></div>',
      '</div>',
      '<div class="form-group" style="margin-bottom:14px">',
      '<label class="form-label">Observações</label>',
      '<input class="form-ctrl" id="sus-new-obs" style="font-size:12px">',
      '</div>',
      '<button class="btn btn-primary" id="sus-new-save">Cadastrar suspensão</button>'
    ].join('')

    UI.openModal(html)
    document.getElementById('sus-new-save').onclick = salvarNova
  }

  async function salvarNova() {
    const cid = document.getElementById('sus-new-cliente-val').value
    const proc = document.getElementById('sus-new-proc').value.trim()
    if (!cid) { UI.notif('Selecione um cliente', 'error'); return }
    if (!proc) { UI.notif('Informe o número do processo', 'error'); return }

    const obj = {
      id: Data.genId('s'),
      cliente_id: cid,
      processo: proc,
      ano: parseInt(document.getElementById('sus-new-ano').value) || new Date().getFullYear(),
      protocolo: document.getElementById('sus-new-proto').value.trim(),
      senha: document.getElementById('sus-new-senha').value.trim(),
      defesa_previa: document.getElementById('sus-new-def').value,
      jari: document.getElementById('sus-new-jari').value,
      cetran: document.getElementById('sus-new-cetran').value,
      vencimento_jari: document.getElementById('sus-new-vjari').value || null,
      vencimento_cetran: document.getElementById('sus-new-vcetran').value || null,
      observacao: document.getElementById('sus-new-obs').value.trim(),
      encerrado: false,
      ultima_att: Data.today(),
      cadastro: Data.today()
    }
    if (deveEncerrar(obj)) obj.encerrado = true

    try {
      await createSuspensao(obj)
      UI.closeModal()
      renderLista()
      UI.notif('Suspensão cadastrada!')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  // ── AUTOCOMPLETE ──────────────────────────────────────────
  function acSelecionar(c) {
    const q = document.getElementById('sus-new-cliente-q'); if (q) q.value = c.nome
    const v = document.getElementById('sus-new-cliente-val'); if (v) v.value = c.id
    const l = document.getElementById('sus-new-cliente-list'); if (l) l.classList.remove('open')
  }

  function acFiltrar() {
    const inp = document.getElementById('sus-new-cliente-q')
    const lst = document.getElementById('sus-new-cliente-list')
    const val = document.getElementById('sus-new-cliente-val')
    if (!inp || !lst) return
    if (val) val.value = ''
    lst.classList.add('open')
    UI.acBuild('sus-new-cliente-list', inp.value, Data.getClientes(), acSelecionar)
  }

  function acFechar() {
    setTimeout(() => {
      const l = document.getElementById('sus-new-cliente-list')
      if (l) l.classList.remove('open')
    }, 160)
  }

  return {
    render, renderLista, abrirDetalhe, abrirNova,
    acFiltrar, acFechar, sortBy,
    precisaRecurso, proximaEtapa, getLista, garantirCarregado, getById,
    confirmarRecurso, etapaAtual, statusAtual
  }
})()
