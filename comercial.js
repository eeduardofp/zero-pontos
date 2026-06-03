// ─── COMERCIAL ───────────────────────────────────────────────
// Pipeline de oportunidades de venda

const Comercial = (() => {
  let oportunidades = []

  // ── CACHE ─────────────────────────────────────────────────
  function getOps() { return oportunidades }
  function gOp(id) { return oportunidades.find(o => o.id === id) || null }

  async function loadOportunidades() {
    const { data, error } = await Auth.getClient()
      .from('oportunidades')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    oportunidades = data
    return data
  }

  async function createOportunidade(obj) {
    const { data, error } = await Auth.getClient()
      .from('oportunidades')
      .insert(obj)
      .select()
      .single()
    if (error) throw error
    oportunidades.unshift(data)
    return data
  }

  async function updateOportunidade(id, fields) {
    const { data, error } = await Auth.getClient()
      .from('oportunidades')
      .update(fields)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const idx = oportunidades.findIndex(o => o.id === id)
    if (idx >= 0) oportunidades[idx] = { ...oportunidades[idx], ...data }
    return data
  }

  // ── MÉTRICAS ──────────────────────────────────────────────
  function calcMetricas() {
    const abertas     = oportunidades.filter(o => o.status === 'Aberta')
    const negociando  = oportunidades.filter(o => o.status === 'Em negociação')
    const convertidas = oportunidades.filter(o => o.status === 'Convertida')
    const perdidas    = oportunidades.filter(o => o.status === 'Perdida')
    const fechadas    = convertidas.length + perdidas.length
    const taxaConv    = fechadas > 0 ? Math.round(convertidas.length / fechadas * 100) : 0
    const potencial   = [...abertas, ...negociando].reduce((s, o) => s + (o.valor_servico || 0), 0)
    const convertido  = convertidas.reduce((s, o) => s + (o.valor_servico || 0), 0)

    // tempo médio de fechamento
    let tempoMedio = null
    const comData = convertidas.filter(o => o.data_identificacao && o.data_fechamento)
    if (comData.length) {
      const soma = comData.reduce((s, o) => {
        const dias = Math.floor((new Date(o.data_fechamento) - new Date(o.data_identificacao)) / 86400000)
        return s + dias
      }, 0)
      tempoMedio = Math.round(soma / comData.length)
    }

    return { abertas, negociando, convertidas, perdidas, taxaConv, potencial, convertido, tempoMedio }
  }

  // ── RENDER PRINCIPAL ──────────────────────────────────────
  async function render() {
    const view = document.getElementById('com-view').value
    await loadOportunidades()
    renderMetricas()
    if (view === 'kanban') renderKanban()
    else renderHistorico()
  }

  function renderMetricas() {
    const m = calcMetricas()
    document.getElementById('com-metrics').innerHTML =
      metric('Potencial em aberto', Data.fmtMoeda(m.potencial), (m.abertas.length + m.negociando.length) + ' oportunidades', 'var(--blue)') +
      metric('Convertido', Data.fmtMoeda(m.convertido), m.convertidas.length + ' fechamentos', 'var(--green)') +
      metric('Taxa de conversão', m.taxaConv + '%', m.convertidas.length + ' de ' + (m.convertidas.length + m.perdidas.length) + ' fechadas', m.taxaConv >= 50 ? 'var(--green)' : 'var(--amber)') +
      metric('Tempo médio', m.tempoMedio !== null ? m.tempoMedio + 'd' : '—', 'para fechar', 'var(--text)')
  }

  function metric(label, val, sub, color) {
    return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-val" style="font-size:20px;color:${color}">${val}</div><div class="metric-sub">${sub}</div></div>`
  }

  // ── KANBAN ────────────────────────────────────────────────
  function renderKanban() {
    document.getElementById('com-hist-filters').style.display = 'none'
    const cols = [
      { status: 'Aberta',         label: 'Aberta',         cls: 'b-wait', color: 'var(--amber)' },
      { status: 'Em negociação',  label: 'Em negociação',  cls: 'b-blue', color: 'var(--blue)'  },
    ]

    const abertas    = oportunidades.filter(o => o.status === 'Aberta')
    const negociando = oportunidades.filter(o => o.status === 'Em negociação')

    const board = document.getElementById('com-board')
    board.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        ${colHTML('Aberta', 'urgent', abertas)}
        ${colHTML('Em negociação', 'warn', negociando)}
      </div>`
  }

  function colHTML(label, cls, list) {
    const cards = list.length
      ? list.map(cardHTML).join('')
      : '<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px">Nenhuma oportunidade</div>'
    return `<div class="kcol ${cls}">
      <div class="kcol-title">${label} <span class="cnt">${list.length}</span></div>
      ${cards}
    </div>`
  }

  function cardHTML(o) {
    const cl = o.cliente_id ? Data.gCliente(o.cliente_id) : null
    const pl = o.placa_id   ? Data.gPlaca(o.placa_id)     : null
    const urgencia = urgenciaCard(o)
    return `<div class="kcard" style="${urgencia.border}" onclick="Comercial.abrirDetalhe('${o.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div class="kcard-name">${cl ? cl.nome.split(' ').slice(0,2).join(' ') : '—'}</div>
        ${o.valor_servico ? `<span style="font-size:12px;font-weight:600;color:var(--green);font-family:var(--mono)">${Data.fmtMoeda(o.valor_servico)}</span>` : ''}
      </div>
      <div class="kcard-placa">${pl ? pl.placa : '—'} · ${o.codigo_ait ? o.codigo_ait.slice(0,20) : '—'}</div>
      ${o.descricao ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.descricao}</div>` : ''}
      <div class="kcard-foot">
        <span class="badge ${urgencia.badge}" style="font-size:10px">${urgencia.label}</span>
        <span class="kcard-days">${o.data_identificacao ? Data.daysSince(o.data_identificacao) + 'd aberta' : ''}</span>
      </div>
    </div>`
  }

  function urgenciaCard(o) {
    const d = Data.daysUntil(o.prazo_defesa)
    if (d !== null && d < 0)  return { border: 'border-left:3px solid var(--red)',   badge: 'b-no',   label: 'Prazo vencido' }
    if (d !== null && d <= 7) return { border: 'border-left:3px solid var(--red)',   badge: 'b-no',   label: d + 'd p/ defesa' }
    if (d !== null && d <= 21)return { border: 'border-left:3px solid var(--amber)', badge: 'b-wait', label: d + 'd p/ defesa' }
    return { border: '', badge: 'b-na', label: 'Em prazo' }
  }

  // ── HISTÓRICO ─────────────────────────────────────────────
  function renderHistorico() {
    document.getElementById('com-hist-filters').style.display = 'flex'
    const st = document.getElementById('com-hist-status').value
    let list = oportunidades.filter(o => o.status === 'Convertida' || o.status === 'Perdida')
    if (st !== 'todos') list = list.filter(o => o.status === st)

    const board = document.getElementById('com-board')
    if (!list.length) {
      board.innerHTML = '<div style="color:var(--text3);text-align:center;padding:40px">Nenhum registro no histórico</div>'
      return
    }

    board.innerHTML = `<div class="tbl-wrap">
      <table style="table-layout:fixed">
        <thead><tr>
          <th style="width:20%">Cliente</th>
          <th style="width:100px">Placa</th>
          <th style="width:22%">AIT</th>
          <th>Descrição</th>
          <th style="width:110px">Valor serviço</th>
          <th style="width:90px">Status</th>
          <th style="width:90px">Fechamento</th>
          <th>Motivo perda</th>
        </tr></thead>
        <tbody>
          ${list.map(o => {
            const cl = o.cliente_id ? Data.gCliente(o.cliente_id) : null
            const pl = o.placa_id   ? Data.gPlaca(o.placa_id)     : null
            return `<tr onclick="Comercial.abrirDetalhe('${o.id}')">
              <td class="bold">${cl ? cl.nome.slice(0,22) : '—'}</td>
              <td style="font-family:var(--mono)">${pl ? pl.placa : '—'}</td>
              <td style="font-family:var(--mono);font-size:11px">${o.codigo_ait ? o.codigo_ait.slice(0,26) : '—'}</td>
              <td style="font-size:12px;color:var(--text3)">${(o.descricao||'—').slice(0,30)}</td>
              <td style="font-family:var(--mono);color:var(--green)">${o.valor_servico ? Data.fmtMoeda(o.valor_servico) : '—'}</td>
              <td>${o.status === 'Convertida' ? '<span class="badge b-ok">Convertida</span>' : '<span class="badge b-no">Perdida</span>'}</td>
              <td style="font-size:12px;font-family:var(--mono)">${Data.fmtData(o.data_fechamento)}</td>
              <td style="font-size:12px;color:var(--text3)">${o.motivo_perda || '—'}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>`
  }

  // ── MODAL NOVA OPORTUNIDADE ───────────────────────────────
  function abrirNovaOportunidade() {
    UI.openModal(`
      <div class="modal-title">Nova oportunidade</div>
      <div class="modal-sub">Identificada durante consulta no Detran</div>

      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Cliente</label>
          <div class="ac-wrap">
            <input class="form-ctrl" id="op-cliente-q" placeholder="Buscar cliente..." oninput="Comercial.opAcFilter()" onfocus="Comercial.opAcOpen()" onblur="Comercial.opAcClose()" autocomplete="off" style="font-size:12px">
            <input type="hidden" id="op-cliente-val">
            <div class="ac-list" id="op-cliente-list"></div>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Placa / Renavan</label>
          <select class="form-ctrl" id="op-placa" style="font-size:12px">
            <option value="">Selecione o cliente primeiro</option>
          </select>
        </div>
      </div>

      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Código da AIT</label>
          <input class="form-ctrl" id="op-ait" placeholder="UF:RD-000100-..." style="font-size:12px">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Descrição breve da multa</label>
          <input class="form-ctrl" id="op-desc" placeholder="Ex: excesso de velocidade 20%" style="font-size:12px">
        </div>
      </div>

      <div class="form-row3" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Valor da AIT (R$)</label>
          <input class="form-ctrl" id="op-valor-ait" type="number" step="0.01" placeholder="0,00" style="font-size:12px">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Valor do nosso serviço (R$)</label>
          <input class="form-ctrl" id="op-valor-serv" type="number" step="0.01" placeholder="0,00" style="font-size:12px">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Data de identificação</label>
          <input class="form-ctrl" id="op-data-id" type="date" value="${Data.today()}" style="font-size:12px">
        </div>
      </div>

      <div class="form-row" style="margin-bottom:14px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Prazo limite para defesa</label>
          <input class="form-ctrl" id="op-prazo-def" type="date" style="font-size:12px">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Prazo de vencimento do débito</label>
          <input class="form-ctrl" id="op-prazo-venc" type="date" style="font-size:12px">
        </div>
      </div>

      <button class="btn btn-primary" onclick="Comercial.salvarOportunidade()">Cadastrar oportunidade</button>
    `)
    setTimeout(() => UI.acBuild('op-cliente-list', '', Data.getClientes(), opAcSelect), 50)
  }

  // ── MODAL DETALHE ─────────────────────────────────────────
  function abrirDetalhe(id) {
    const o = gOp(id); if (!o) return
    const cl = o.cliente_id ? Data.gCliente(o.cliente_id) : null
    const pl = o.placa_id   ? Data.gPlaca(o.placa_id)     : null
    const urg = urgenciaCard(o)
    const isAtiva = o.status === 'Aberta' || o.status === 'Em negociação'

    UI.openModal(`
      <div class="modal-title">${cl ? cl.nome : 'Oportunidade'}</div>
      <div class="modal-sub">${pl ? pl.placa + ' · ' + pl.renavan : '—'} · Identificada em ${Data.fmtData(o.data_identificacao)}</div>

      <div class="field-grid" style="margin-bottom:14px">
        <div class="field" style="grid-column:1/-1"><div class="field-label">AIT</div><div class="field-val mono" style="font-size:11px">${o.codigo_ait || '—'}</div></div>
        <div class="field"><div class="field-label">Descrição</div><div class="field-val">${o.descricao || '—'}</div></div>
        <div class="field"><div class="field-label">Status</div><div class="field-val">${badgeStatus(o.status)}</div></div>
        <div class="field"><div class="field-label">Valor da AIT</div><div class="field-val mono">${o.valor_ait ? Data.fmtMoeda(o.valor_ait) : '—'}</div></div>
        <div class="field"><div class="field-label">Valor do serviço</div><div class="field-val mono" style="color:var(--green)">${o.valor_servico ? Data.fmtMoeda(o.valor_servico) : '—'}</div></div>
        <div class="field"><div class="field-label">Prazo p/ defesa</div><div class="field-val" style="color:${urg.badge === 'b-no' ? 'var(--red)' : 'var(--text)'}">${Data.fmtData(o.prazo_defesa)}</div></div>
        <div class="field"><div class="field-label">Vencimento do débito</div><div class="field-val">${Data.fmtData(o.prazo_vencimento)}</div></div>
        ${o.motivo_perda ? `<div class="field" style="grid-column:1/-1"><div class="field-label">Motivo da perda</div><div class="field-val">${o.motivo_perda}</div></div>` : ''}
        ${o.ait_gerada_id ? `<div class="field" style="grid-column:1/-1"><div class="field-label">AIT gerada</div><div class="field-val" style="color:var(--blue);cursor:pointer" onclick="UI.closeModal();openAIT('${o.ait_gerada_id}')">Ver AIT no sistema →</div></div>` : ''}
      </div>

      ${isAtiva ? `
      <div class="section-title" style="margin-bottom:10px">Atualizar status</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${o.status !== 'Aberta' ? `<button class="btn btn-ghost btn-sm" onclick="Comercial.moverStatus('${id}','Aberta')">← Mover para Aberta</button>` : ''}
        ${o.status !== 'Em negociação' ? `<button class="btn btn-ghost btn-sm" onclick="Comercial.moverStatus('${id}','Em negociação')">Mover para Em negociação →</button>` : ''}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="Comercial.abrirConverter('${id}')">✓ Converter em serviço</button>
        <button class="btn btn-danger" onclick="Comercial.abrirPerder('${id}')">✗ Marcar como perdida</button>
      </div>
      ` : `<div style="color:var(--text3);font-size:13px">Esta oportunidade foi ${o.status === 'Convertida' ? 'convertida' : 'marcada como perdida'} em ${Data.fmtData(o.data_fechamento)}.</div>`}
    `)
  }

  function badgeStatus(s) {
    if (s === 'Aberta')        return '<span class="badge b-wait">Aberta</span>'
    if (s === 'Em negociação') return '<span class="badge b-blue">Em negociação</span>'
    if (s === 'Convertida')    return '<span class="badge b-ok">Convertida</span>'
    if (s === 'Perdida')       return '<span class="badge b-no">Perdida</span>'
    return '<span class="badge b-na">—</span>'
  }

  // ── MODAL CONVERTER ───────────────────────────────────────
  function abrirConverter(id) {
    const o = gOp(id); if (!o) return
    const cl = o.cliente_id ? Data.gCliente(o.cliente_id) : null
    const pl = o.placa_id   ? Data.gPlaca(o.placa_id)     : null

    UI.openModal(`
      <div class="modal-title">Converter em serviço</div>
      <div class="modal-sub">${cl ? cl.nome : '—'} · ${pl ? pl.placa : '—'}</div>

      <div class="info-box blue" style="margin:14px 0">
        Isso criará automaticamente uma AIT no sistema com os dados desta oportunidade.
      </div>

      <div class="field-grid" style="margin-bottom:14px">
        <div class="field" style="grid-column:1/-1"><div class="field-label">AIT</div><div class="field-val mono" style="font-size:11px">${o.codigo_ait}</div></div>
        <div class="field"><div class="field-label">Placa</div><div class="field-val mono">${pl ? pl.placa : '—'}</div></div>
        <div class="field"><div class="field-label">Valor do serviço</div><div class="field-val" style="color:var(--green)">${o.valor_servico ? Data.fmtMoeda(o.valor_servico) : '—'}</div></div>
      </div>

      <div class="form-row" style="margin-bottom:14px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Status inicial — Defesa Prévia</label>
          <select class="form-ctrl" id="conv-defesa" style="font-size:12px">
            <option value="Aguardando">Aguardando</option>
            <option value="Não realizado">Não realizado</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Data da venda</label>
          <input type="date" class="form-ctrl" id="conv-dvenda" value="${Data.today()}" style="font-size:12px">
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="Comercial.confirmarConverter('${id}')">Confirmar conversão</button>
        <button class="btn btn-ghost" onclick="Comercial.abrirDetalhe('${id}')">Voltar</button>
      </div>
    `)
  }

  // ── MODAL PERDER ──────────────────────────────────────────
  function abrirPerder(id) {
    const o = gOp(id); if (!o) return
    UI.openModal(`
      <div class="modal-title">Marcar como perdida</div>
      <div class="modal-sub">${o.codigo_ait || '—'}</div>
      <div class="form-group" style="margin:16px 0 14px">
        <label class="form-label">Motivo da perda</label>
        <select class="form-ctrl" id="perda-motivo" style="font-size:12px">
          <option value="">Selecione...</option>
          <option value="Cliente não quis">Cliente não quis</option>
          <option value="Prazo vencido">Prazo vencido</option>
          <option value="Valor alto">Valor alto</option>
          <option value="Cliente sumiu">Cliente sumiu</option>
          <option value="Já tinha advogado">Já tinha advogado</option>
          <option value="Outro">Outro</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Observação (opcional)</label>
        <input class="form-ctrl" id="perda-obs" placeholder="Detalhes..." style="font-size:12px">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-danger" onclick="Comercial.confirmarPerda('${id}')">Confirmar perda</button>
        <button class="btn btn-ghost" onclick="Comercial.abrirDetalhe('${id}')">Voltar</button>
      </div>
    `)
  }

  // ── AÇÕES ─────────────────────────────────────────────────
  async function salvarOportunidade() {
    const cid = document.getElementById('op-cliente-val').value
    const cod = document.getElementById('op-ait').value.trim().toUpperCase()
    if (!cid) { UI.notif('Selecione um cliente', 'error'); return }
    if (!cod) { UI.notif('Informe o código da AIT', 'error'); return }

    const obj = {
      id: Data.genId('op'),
      cliente_id: cid,
      placa_id: document.getElementById('op-placa').value || null,
      codigo_ait: cod,
      descricao: document.getElementById('op-desc').value.trim(),
      valor_ait: parseFloat(document.getElementById('op-valor-ait').value) || null,
      valor_servico: parseFloat(document.getElementById('op-valor-serv').value) || null,
      data_identificacao: document.getElementById('op-data-id').value || Data.today(),
      prazo_defesa: document.getElementById('op-prazo-def').value || null,
      prazo_vencimento: document.getElementById('op-prazo-venc').value || null,
      status: 'Aberta'
    }

    try {
      await createOportunidade(obj)
      UI.closeModal()
      render()
      UI.notif('Oportunidade cadastrada!')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  async function moverStatus(id, novoStatus) {
    try {
      await updateOportunidade(id, { status: novoStatus })
      render()
      UI.closeModal()
      UI.notif('Status atualizado!')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  async function confirmarConverter(id) {
    const o = gOp(id); if (!o) return
    const pl = o.placa_id ? Data.gPlaca(o.placa_id) : null
    if (!pl) { UI.notif('Placa não encontrada', 'error'); return }

    const defesa  = document.getElementById('conv-defesa').value
    const dvenda  = document.getElementById('conv-dvenda').value

    // Criar AIT automaticamente
    const aitObj = {
      id: Data.genId('a'),
      codigo: o.codigo_ait,
      placa_id: pl.id,
      enquadramento: o.descricao || '',
      protocolo: '', senha: '',
      ano: new Date().getFullYear(),
      cadastro: Data.today(),
      ultima_att: Data.today(),
      vencimento: o.prazo_defesa || null,
      data_venda: dvenda || Data.today(),
      observacao: 'Convertida de oportunidade comercial',
      valor: o.valor_servico || 0,
      pagamento: 'Pendente',
      encerrado: false,
      defesa_previa: defesa,
      jari: '',
      segunda_instancia: ''
    }

    try {
      const aitSalva = await API.createAIT(aitObj)
      Data.addAIT(aitSalva)

      await updateOportunidade(id, {
        status: 'Convertida',
        data_fechamento: Data.today(),
        ait_gerada_id: aitSalva.id
      })

      UI.updateStats()
      UI.closeModal()
      render()
      UI.notif('Convertida! AIT criada no sistema.')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  async function confirmarPerda(id) {
    const motivo = document.getElementById('perda-motivo').value
    if (!motivo) { UI.notif('Selecione o motivo', 'error'); return }
    const obs = document.getElementById('perda-obs').value.trim()
    const motivoFinal = obs ? motivo + ' — ' + obs : motivo

    try {
      await updateOportunidade(id, {
        status: 'Perdida',
        data_fechamento: Data.today(),
        motivo_perda: motivoFinal
      })
      UI.closeModal()
      render()
      UI.notif('Oportunidade marcada como perdida')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  // ── AUTOCOMPLETE INTERNO ──────────────────────────────────
  function opAcFilter() {
    const q = document.getElementById('op-cliente-q').value
    document.getElementById('op-cliente-val').value = ''
    UI.acBuild('op-cliente-list', q, Data.getClientes(), opAcSelect)
    document.getElementById('op-cliente-list').classList.add('open')
  }
  function opAcOpen() { opAcFilter() }
  function opAcClose() { setTimeout(() => document.getElementById('op-cliente-list').classList.remove('open'), 160) }
  function opAcSelect(c) {
    document.getElementById('op-cliente-q').value = c.nome
    document.getElementById('op-cliente-val').value = c.id
    document.getElementById('op-cliente-list').classList.remove('open')
    // carregar placas do cliente
    const pls = Data.placasDe(c.id)
    const sel = document.getElementById('op-placa')
    sel.innerHTML = pls.length
      ? pls.map(p => `<option value="${p.id}">${p.placa} · ${p.renavan}</option>`).join('')
      : '<option value="">Nenhuma placa cadastrada</option>'
  }

  return {
    render, getOps, gOp,
    abrirNovaOportunidade, abrirDetalhe,
    abrirConverter, abrirPerder,
    salvarOportunidade, moverStatus,
    confirmarConverter, confirmarPerda,
    opAcFilter, opAcOpen, opAcClose, opAcSelect
  }
})()
