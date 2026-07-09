// ─── COMERCIAL ───────────────────────────────────────────────
// Pipeline de oportunidades de venda

const Comercial = (() => {
  let ops = []

  // ── SUPABASE ──────────────────────────────────────────────
  function db() { return Auth.getClient() }

  // Supabase corta em 1000 linhas por padrão (PostgREST max-rows), sem erro —
  // silenciosamente. Paginar sempre que a lista puder crescer.
  async function buscarTudo(query) {
    let tudo = [], de = 0
    const passo = 1000
    while (true) {
      const { data, error } = await query.range(de, de + passo - 1)
      if (error) throw error
      tudo = tudo.concat(data)
      if (data.length < passo) break
      de += passo
    }
    return tudo
  }

  async function loadOps() {
    ops = await buscarTudo(db().from('oportunidades').select('*').order('created_at', { ascending: false }))
  }

  async function createOp(obj) {
    const { data, error } = await db().from('oportunidades').insert(obj).select().single()
    if (error) throw error
    ops.unshift(data)
    return data
  }

  async function updateOp(id, fields) {
    const { data, error } = await db().from('oportunidades').update(fields).eq('id', id).select().single()
    if (error) throw error
    const idx = ops.findIndex(o => o.id === id)
    if (idx >= 0) ops[idx] = { ...ops[idx], ...data }
    return data
  }

  function gOp(id) { return ops.find(o => o.id === id) || null }

  // ── RENDER ────────────────────────────────────────────────
  async function render() {
    const view = document.getElementById('com-view').value
    try {
      await loadOps()
    } catch(e) {
      UI.notif('Erro ao carregar oportunidades: ' + e.message, 'error')
      return
    }
    renderMetricas()
    if (view === 'kanban') renderKanban()
    else renderHistorico()
  }

  function renderMetricas() {
    const abertas     = ops.filter(o => o.status === 'Aberta')
    const negociando  = ops.filter(o => o.status === 'Em negociação')
    const convertidas = ops.filter(o => o.status === 'Convertida')
    const perdidas    = ops.filter(o => o.status === 'Perdida')
    const fechadas    = convertidas.length + perdidas.length
    const taxaConv    = fechadas > 0 ? Math.round(convertidas.length / fechadas * 100) : 0
    const potencial   = [...abertas, ...negociando].reduce((s, o) => s + (o.valor_servico || 0), 0)
    const convertido  = convertidas.reduce((s, o) => s + (o.valor_servico || 0), 0)

    let tempoMedio = null
    const comData = convertidas.filter(o => o.data_identificacao && o.data_fechamento)
    if (comData.length) {
      const soma = comData.reduce((s, o) => s + Math.floor((new Date(o.data_fechamento) - new Date(o.data_identificacao)) / 86400000), 0)
      tempoMedio = Math.round(soma / comData.length)
    }

    function m(label, val, sub, color) {
      return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-val" style="font-size:20px;color:${color}">${val}</div><div class="metric-sub">${sub}</div></div>`
    }

    document.getElementById('com-metrics').innerHTML =
      m('Potencial em aberto', Data.fmtMoeda(potencial), (abertas.length + negociando.length) + ' oportunidades', 'var(--blue)') +
      m('Convertido', Data.fmtMoeda(convertido), convertidas.length + ' fechamentos', 'var(--green)') +
      m('Taxa de conversão', taxaConv + '%', convertidas.length + ' de ' + fechadas + ' fechadas', taxaConv >= 50 ? 'var(--green)' : 'var(--amber)') +
      m('Tempo médio', tempoMedio !== null ? tempoMedio + 'd' : '—', 'para fechar', 'var(--text)')
  }

  // ── KANBAN ────────────────────────────────────────────────
  function renderKanban() {
    const hf = document.getElementById('com-hist-filters')
    if (hf) hf.style.display = 'none'

    function urgencia(o) {
      const d = Data.daysUntil(o.prazo_defesa)
      if (d !== null && d < 0)   return { border: 'border-left:3px solid var(--red)',   badge: 'b-no',   label: 'Prazo vencido' }
      if (d !== null && d <= 7)  return { border: 'border-left:3px solid var(--red)',   badge: 'b-no',   label: d + 'd p/ defesa' }
      if (d !== null && d <= 21) return { border: 'border-left:3px solid var(--amber)', badge: 'b-wait', label: d + 'd p/ defesa' }
      return { border: '', badge: 'b-na', label: 'Em prazo' }
    }

    function card(o) {
      const cl = o.cliente_id ? Data.gCliente(o.cliente_id) : null
      const pl = o.placa_id   ? Data.gPlaca(o.placa_id)     : null
      const u  = urgencia(o)
      return `<div class="kcard" style="${u.border}" onclick="Comercial.abrirDetalhe('${o.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
          <div class="kcard-name">${cl ? cl.nome.split(' ').slice(0,2).join(' ') : '—'}</div>
          ${o.valor_servico ? `<span style="font-size:12px;font-weight:600;color:var(--green);font-family:var(--mono)">${Data.fmtMoeda(o.valor_servico)}</span>` : ''}
        </div>
        <div class="kcard-placa">${pl ? pl.placa : '—'} · ${o.codigo_ait ? o.codigo_ait.slice(0,20) : '—'}</div>
        ${o.descricao ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.descricao}</div>` : ''}
        <div class="kcard-foot">
          <span class="badge ${u.badge}" style="font-size:10px">${u.label}</span>
          <span class="kcard-days">${o.data_identificacao ? Data.daysSince(o.data_identificacao) + 'd aberta' : ''}</span>
        </div>
      </div>`
    }

    function col(label, cls, list) {
      const cards = list.length
        ? list.map(card).join('')
        : '<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px">Nenhuma oportunidade</div>'
      return `<div class="kcol ${cls}"><div class="kcol-title">${label} <span class="cnt">${list.length}</span></div>${cards}</div>`
    }

    const abertas    = ops.filter(o => o.status === 'Aberta')
    const negociando = ops.filter(o => o.status === 'Em negociação')

    document.getElementById('com-board').innerHTML =
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        ${col('Aberta', 'urgent', abertas)}
        ${col('Em negociação', 'warn', negociando)}
      </div>`
  }

  // ── HISTÓRICO ─────────────────────────────────────────────
  function renderHistorico() {
    const hf = document.getElementById('com-hist-filters')
    if (hf) hf.style.display = 'flex'
    const st = document.getElementById('com-hist-status').value
    let list = ops.filter(o => o.status === 'Convertida' || o.status === 'Perdida')
    if (st !== 'todos') list = list.filter(o => o.status === st)
    const board = document.getElementById('com-board')
    if (!list.length) {
      board.innerHTML = '<div style="color:var(--text3);text-align:center;padding:40px">Nenhum registro no histórico</div>'
      return
    }
    board.innerHTML = `<div class="tbl-wrap"><table style="table-layout:fixed">
      <thead><tr>
        <th style="width:20%">Cliente</th><th style="width:100px">Placa</th>
        <th style="width:22%">AIT</th><th>Descrição</th>
        <th style="width:110px">Valor serviço</th><th style="width:90px">Status</th>
        <th style="width:90px">Fechamento</th><th>Motivo</th>
      </tr></thead>
      <tbody>${list.map(o => {
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
      }).join('')}</tbody>
    </table></div>`
  }

  // ── MODAIS ────────────────────────────────────────────────
  function abrirNovaOportunidade() {
    UI.openModal(`
      <div class="modal-title">Nova oportunidade</div>
      <div class="modal-sub">Identificada durante consulta no Detran</div>
      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Cliente</label>
          <div class="ac-wrap">
            <input class="form-ctrl" id="op-cliente-q" placeholder="Buscar cliente..."
              oninput="Comercial.acFiltrar()" onfocus="Comercial.acFiltrar()" onblur="Comercial.acFechar()"
              autocomplete="off" style="font-size:12px">
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
  }

  function abrirDetalhe(id) {
    const o = gOp(id); if (!o) return
    const cl = o.cliente_id ? Data.gCliente(o.cliente_id) : null
    const pl = o.placa_id   ? Data.gPlaca(o.placa_id)     : null
    const isAtiva = o.status === 'Aberta' || o.status === 'Em negociação'

    function badgeSt(s) {
      if (s === 'Aberta')        return '<span class="badge b-wait">Aberta</span>'
      if (s === 'Em negociação') return '<span class="badge b-blue">Em negociação</span>'
      if (s === 'Convertida')    return '<span class="badge b-ok">Convertida</span>'
      return '<span class="badge b-no">Perdida</span>'
    }

    UI.openModal(`
      <div class="modal-title">${cl ? cl.nome : 'Oportunidade'}</div>
      <div class="modal-sub">${pl ? pl.placa + ' · ' + pl.renavan : '—'} · Identificada em ${Data.fmtData(o.data_identificacao)}</div>
      <div class="field-grid" style="margin-bottom:14px">
        <div class="field" style="grid-column:1/-1"><div class="field-label">AIT</div><div class="field-val mono" style="font-size:11px">${o.codigo_ait || '—'}</div></div>
        <div class="field"><div class="field-label">Descrição</div><div class="field-val">${o.descricao || '—'}</div></div>
        <div class="field"><div class="field-label">Status</div><div class="field-val">${badgeSt(o.status)}</div></div>
        <div class="field"><div class="field-label">Valor da AIT</div><div class="field-val mono">${o.valor_ait ? Data.fmtMoeda(o.valor_ait) : '—'}</div></div>
        <div class="field"><div class="field-label">Valor do serviço</div><div class="field-val mono" style="color:var(--green)">${o.valor_servico ? Data.fmtMoeda(o.valor_servico) : '—'}</div></div>
        <div class="field"><div class="field-label">Prazo p/ defesa</div><div class="field-val">${Data.fmtData(o.prazo_defesa)}</div></div>
        <div class="field"><div class="field-label">Vencimento do débito</div><div class="field-val">${Data.fmtData(o.prazo_vencimento)}</div></div>
        ${o.motivo_perda ? `<div class="field" style="grid-column:1/-1"><div class="field-label">Motivo da perda</div><div class="field-val">${o.motivo_perda}</div></div>` : ''}
        ${o.ait_gerada_id ? `<div class="field" style="grid-column:1/-1"><div class="field-label">AIT gerada</div><div class="field-val" style="color:var(--blue);cursor:pointer" onclick="UI.closeModal();openAIT('${o.ait_gerada_id}')">Ver AIT no sistema →</div></div>` : ''}
      </div>
      ${isAtiva ? `
        <div class="section-title" style="margin-bottom:10px">Atualizar status</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          ${o.status !== 'Aberta'        ? `<button class="btn btn-ghost btn-sm" onclick="Comercial.moverStatus('${id}','Aberta')">← Mover para Aberta</button>` : ''}
          ${o.status !== 'Em negociação' ? `<button class="btn btn-ghost btn-sm" onclick="Comercial.moverStatus('${id}','Em negociação')">Mover para Em negociação →</button>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="Comercial.abrirConverter('${id}')">✓ Converter em serviço</button>
          <button class="btn btn-danger"  onclick="Comercial.abrirPerder('${id}')">✗ Marcar como perdida</button>
          <button class="btn btn-ghost"   onclick="Comercial.abrirEditar('${id}')">✎ Editar</button>
        </div>
      ` : `<div style="color:var(--text3);font-size:13px">Esta oportunidade foi ${o.status === 'Convertida' ? 'convertida' : 'marcada como perdida'} em ${Data.fmtData(o.data_fechamento)}.</div>`}
    `)
  }

  function abrirEditar(id) {
    const o = gOp(id); if (!o) return
    const cl = o.cliente_id ? Data.gCliente(o.cliente_id) : null
    const pl = o.placa_id   ? Data.gPlaca(o.placa_id)     : null

    // Montar options de placas do cliente atual
    const pls = o.cliente_id ? Data.placasDe(o.cliente_id) : []
    const placaOpts = pls.length
      ? pls.map(p => `<option value="${p.id}" ${p.id === o.placa_id ? 'selected' : ''}>${p.placa} · ${p.renavan}</option>`).join('')
      : '<option value="">Nenhuma placa</option>'

    UI.openModal(`
      <div class="modal-title">Editar oportunidade</div>
      <div class="modal-sub">${cl ? cl.nome : '—'}</div>

      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Cliente</label>
          <div class="ac-wrap">
            <input class="form-ctrl" id="op-cliente-q" placeholder="Buscar cliente..."
              oninput="Comercial.acFiltrar()" onfocus="Comercial.acFiltrar()" onblur="Comercial.acFechar()"
              autocomplete="off" style="font-size:12px" value="${cl ? cl.nome : ''}">
            <input type="hidden" id="op-cliente-val" value="${o.cliente_id || ''}">
            <div class="ac-list" id="op-cliente-list"></div>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Placa / Renavan</label>
          <select class="form-ctrl" id="op-placa" style="font-size:12px">${placaOpts}</select>
        </div>
      </div>

      <div class="form-row" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Código da AIT</label>
          <input class="form-ctrl" id="op-ait" value="${o.codigo_ait || ''}" style="font-size:12px">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Descrição breve da multa</label>
          <input class="form-ctrl" id="op-desc" value="${o.descricao || ''}" style="font-size:12px">
        </div>
      </div>

      <div class="form-row3" style="margin-bottom:10px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Valor da AIT (R$)</label>
          <input class="form-ctrl" id="op-valor-ait" type="number" step="0.01" value="${o.valor_ait || ''}" style="font-size:12px">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Valor do nosso serviço (R$)</label>
          <input class="form-ctrl" id="op-valor-serv" type="number" step="0.01" value="${o.valor_servico || ''}" style="font-size:12px">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Data de identificação</label>
          <input class="form-ctrl" id="op-data-id" type="date" value="${o.data_identificacao || ''}" style="font-size:12px">
        </div>
      </div>

      <div class="form-row" style="margin-bottom:14px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Prazo limite para defesa</label>
          <input class="form-ctrl" id="op-prazo-def" type="date" value="${o.prazo_defesa || ''}" style="font-size:12px">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Prazo de vencimento do débito</label>
          <input class="form-ctrl" id="op-prazo-venc" type="date" value="${o.prazo_vencimento || ''}" style="font-size:12px">
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="Comercial.salvarEdicao('${id}')">Salvar alterações</button>
        <button class="btn btn-ghost" onclick="Comercial.abrirDetalhe('${id}')">Cancelar</button>
      </div>
    `)
  }

  async function salvarEdicao(id) {
    const cid = document.getElementById('op-cliente-val').value
    const cod = document.getElementById('op-ait').value.trim().toUpperCase()
    if (!cid) { UI.notif('Selecione um cliente', 'error'); return }
    if (!cod) { UI.notif('Informe o código da AIT', 'error'); return }

    const fields = {
      cliente_id:        cid,
      placa_id:          document.getElementById('op-placa').value || null,
      codigo_ait:        cod,
      descricao:         document.getElementById('op-desc').value.trim(),
      valor_ait:         parseFloat(document.getElementById('op-valor-ait').value) || null,
      valor_servico:     parseFloat(document.getElementById('op-valor-serv').value) || null,
      data_identificacao:document.getElementById('op-data-id').value || null,
      prazo_defesa:      document.getElementById('op-prazo-def').value || null,
      prazo_vencimento:  document.getElementById('op-prazo-venc').value || null,
    }

    try {
      await updateOp(id, fields)
      UI.closeModal()
      await render()
      UI.notif('Oportunidade atualizada!')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

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
        <button class="btn btn-ghost"   onclick="Comercial.abrirDetalhe('${id}')">Voltar</button>
      </div>
    `)
  }

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
        <button class="btn btn-ghost"  onclick="Comercial.abrirDetalhe('${id}')">Voltar</button>
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
      await createOp(obj)
      UI.closeModal()
      await render()
      UI.notif('Oportunidade cadastrada!')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  async function moverStatus(id, novoStatus) {
    try {
      await updateOp(id, { status: novoStatus })
      UI.closeModal()
      await render()
      UI.notif('Status atualizado!')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  async function confirmarConverter(id) {
    const o = gOp(id); if (!o) return
    const pl = o.placa_id ? Data.gPlaca(o.placa_id) : null
    if (!pl) { UI.notif('Selecione uma placa na oportunidade antes de converter', 'error'); return }
    const defesa = document.getElementById('conv-defesa').value
    const dvenda = document.getElementById('conv-dvenda').value
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
      await updateOp(id, { status: 'Convertida', data_fechamento: Data.today(), ait_gerada_id: aitSalva.id })
      UI.updateStats()
      UI.closeModal()
      await render()
      UI.notif('Convertida! AIT criada no sistema.')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  async function confirmarPerda(id) {
    const motivo = document.getElementById('perda-motivo').value
    if (!motivo) { UI.notif('Selecione o motivo', 'error'); return }
    const obs = document.getElementById('perda-obs').value.trim()
    try {
      await updateOp(id, { status: 'Perdida', data_fechamento: Data.today(), motivo_perda: obs ? motivo + ' — ' + obs : motivo })
      UI.closeModal()
      await render()
      UI.notif('Oportunidade marcada como perdida')
    } catch(e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  // ── AUTOCOMPLETE ──────────────────────────────────────────
  function acSelecionar(c) {
    const q   = document.getElementById('op-cliente-q');   if (q)   q.value   = c.nome
    const val = document.getElementById('op-cliente-val'); if (val) val.value = c.id
    const lst = document.getElementById('op-cliente-list'); if (lst) lst.classList.remove('open')
    const pls = Data.placasDe(c.id)
    const sel = document.getElementById('op-placa')
    if (sel) sel.innerHTML = pls.length
      ? pls.map(p => `<option value="${p.id}">${p.placa} · ${p.renavan}</option>`).join('')
      : '<option value="">Nenhuma placa cadastrada</option>'
  }

  function acFiltrar() {
    const inp = document.getElementById('op-cliente-q')
    const lst = document.getElementById('op-cliente-list')
    const val = document.getElementById('op-cliente-val')
    if (!inp || !lst) return
    if (val) val.value = ''
    lst.classList.add('open')
    UI.acBuild('op-cliente-list', inp.value, Data.getClientes(), acSelecionar)
  }

  function acFechar() {
    setTimeout(() => {
      const lst = document.getElementById('op-cliente-list')
      if (lst) lst.classList.remove('open')
    }, 160)
  }

  return {
    render,
    abrirNovaOportunidade, abrirDetalhe,
    abrirConverter, abrirPerder, abrirEditar,
    salvarOportunidade, salvarEdicao, moverStatus,
    confirmarConverter, confirmarPerda,
    acFiltrar, acFechar
  }
})()
