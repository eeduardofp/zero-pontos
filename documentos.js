// ─── DOCUMENTOS ───────────────────────────────────────────────
// Seção de documentos (cofre R2 via Worker zp-docs) nos modais de
// AIT, cliente e suspensão. Índice na tabela `documentos` (Supabase);
// binário no bucket. Um modal por vez → estado de owner é module-level.
const Documentos = (() => {
  const TIPOS = {
    ait_id:       ['NA', 'NP', 'AIT', 'Defesa', 'Parecer', 'Comprovante', 'Outro'],
    cliente_id:   ['CNH', 'CRLV', 'Procuracao', 'Outro'],
    suspensao_id: ['NA', 'NP', 'Defesa', 'Parecer', 'Comprovante', 'Outro'],
  }
  const PREFIXO = { ait_id: 'aits', cliente_id: 'clientes', suspensao_id: 'suspensoes' }

  let _owner = null        // { ait_id: id } | { cliente_id: id } | { suspensao_id: id }
  let _containerId = null

  function db() { return Auth.getClient() }
  function ownerKey() { return Object.keys(_owner)[0] }

  async function token() {
    const s = await Auth.getSession()
    return s ? s.access_token : null
  }

  async function listar() {
    const k = ownerKey()
    const { data, error } = await db().from('documentos')
      .select('*').eq(k, _owner[k]).order('created_at', { ascending: true })
    if (error) throw error
    return data
  }

  function fmtTamanho(b) {
    if (!b) return ''
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB'
    return Math.max(1, Math.round(b / 1024)) + ' KB'
  }

  async function render(containerId, owner) {
    _owner = owner
    _containerId = containerId
    const el = document.getElementById(containerId)
    if (!el) return
    if (!WORKER_URL) {
      el.innerHTML = '<div style="color:var(--text3);font-size:12px">Cofre ainda não configurado (WORKER_URL vazio no config.js).</div>'
      return
    }
    el.innerHTML = '<div style="color:var(--text3);font-size:12px">Carregando documentos…</div>'
    let docs
    try { docs = await listar() }
    catch (e) { el.innerHTML = '<div style="color:var(--red);font-size:12px">Erro ao listar: ' + e.message + '</div>'; return }

    const tipos = TIPOS[ownerKey()]
    const linhas = docs.map(d =>
      '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">' +
        '<span class="badge b-blue" style="min-width:64px;text-align:center">' + d.tipo + '</span>' +
        '<span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + d.nome_arquivo + '</span>' +
        '<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">' + fmtTamanho(d.tamanho_bytes) + '</span>' +
        '<button class="btn btn-ghost btn-sm" onclick="Documentos.abrir(\'' + d.id + '\')">Abrir</button>' +
        '<button class="btn btn-danger btn-sm" onclick="Documentos.excluir(\'' + d.id + '\')">✕</button>' +
      '</div>'
    ).join('')

    el.innerHTML =
      (docs.length ? linhas : '<div style="color:var(--text3);font-size:12px;padding:4px 0">Nenhum documento anexado.</div>') +
      '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">' +
        '<select class="form-ctrl" id="doc-tipo" style="width:auto;font-size:12px">' + tipos.map(t => '<option>' + t + '</option>').join('') + '</select>' +
        '<input type="file" id="doc-file" accept="application/pdf,image/*" style="font-size:12px;flex:1;min-width:160px">' +
        '<button class="btn btn-primary btn-sm" id="doc-up-btn" onclick="Documentos.upload()">Anexar</button>' +
      '</div>'
  }

  async function upload() {
    const input = document.getElementById('doc-file')
    const file = input && input.files[0]
    if (!file) { UI.notif('Escolha um arquivo', 'error'); return }
    const tipo = document.getElementById('doc-tipo').value
    const btn = document.getElementById('doc-up-btn')
    btn.disabled = true; btn.textContent = 'Enviando…'
    try {
      const t = await token()
      const k = ownerKey()
      const id = Data.genId('d')
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      const r2Key = PREFIXO[k] + '/' + _owner[k] + '/' + id + '.' + ext
      const resp = await fetch(WORKER_URL + '/doc?key=' + encodeURIComponent(r2Key), {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': file.type || 'application/pdf' },
        body: file,
      })
      if (!resp.ok) throw new Error('upload falhou (' + resp.status + ')')
      const { error } = await db().from('documentos').insert({
        id: id,
        [k]: _owner[k],
        tipo: tipo,
        nome_arquivo: file.name,
        r2_key: r2Key,
        tamanho_bytes: file.size,
        mime: file.type || 'application/pdf',
      })
      if (error) throw error
      UI.notif('Documento anexado!')
      render(_containerId, _owner)
    } catch (e) {
      UI.notif('Erro: ' + e.message, 'error')
      btn.disabled = false; btn.textContent = 'Anexar'
    }
  }

  async function abrir(docId) {
    try {
      const { data, error } = await db().from('documentos').select('*').eq('id', docId).single()
      if (error) throw error
      const t = await token()
      const resp = await fetch(WORKER_URL + '/doc?key=' + encodeURIComponent(data.r2_key), {
        headers: { Authorization: 'Bearer ' + t },
      })
      if (!resp.ok) throw new Error('download falhou (' + resp.status + ')')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  async function excluir(docId) {
    if (!confirm('Excluir este documento? O arquivo sai do cofre.')) return
    try {
      const { data, error } = await db().from('documentos').select('r2_key').eq('id', docId).single()
      if (error) throw error
      const t = await token()
      const resp = await fetch(WORKER_URL + '/doc?key=' + encodeURIComponent(data.r2_key), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + t },
      })
      if (!resp.ok) throw new Error('exclusão no cofre falhou (' + resp.status + ')')
      const { error: e2 } = await db().from('documentos').delete().eq('id', docId)
      if (e2) throw e2
      UI.notif('Documento excluído')
      render(_containerId, _owner)
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  return { render, upload, abrir, excluir }
})()
