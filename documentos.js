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
  let _cliRef = null       // { containerId, clienteId } da lista de docs do titular

  // Re-renderiza o que estiver aberto (lista principal e/ou docs do titular).
  function refreshTudo() {
    if (_owner && _containerId) render(_containerId, _owner)
    if (_cliRef) renderCliente(_cliRef.containerId, _cliRef.clienteId)
  }

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
    _cliRef = null
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
    const esc = s => String(s || '').replace(/'/g, '\\u0027').replace(/"/g, '&quot;')
    const linhas = docs.map(d => {
      const lista = tipos.includes(d.tipo) ? tipos : [d.tipo].concat(tipos)
      const opts = lista.map(t => `<option${t === d.tipo ? ' selected' : ''}>${t}</option>`).join('')
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">' +
        '<select class="doc-tipo-sel" onchange="Documentos.setTipo(\'' + d.id + '\',this.value)" title="Tipo do documento">' + opts + '</select>' +
        '<span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + d.nome_arquivo + '</span>' +
        '<span class="doc-act" title="Renomear" onclick="Documentos.renomear(\'' + d.id + '\',\'' + esc(d.nome_arquivo) + '\')">✎</span>' +
        '<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">' + fmtTamanho(d.tamanho_bytes) + '</span>' +
        '<button class="btn btn-ghost btn-sm" onclick="Documentos.abrir(\'' + d.id + '\')">Abrir</button>' +
        '<button class="btn btn-danger btn-sm" onclick="Documentos.excluir(\'' + d.id + '\')">✕</button>' +
      '</div>'
    }).join('')

    el.innerHTML =
      (docs.length ? linhas : '<div style="color:var(--text3);font-size:12px;padding:4px 0">Nenhum documento anexado.</div>') +
      '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">' +
        '<input type="file" id="doc-file" multiple style="font-size:12px;flex:1;min-width:160px">' +
        '<button class="btn btn-primary btn-sm" id="doc-up-btn" onclick="Documentos.upload()">Anexar</button>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text3);margin-top:4px">Escolha um ou vários arquivos. Sobem como “Outro” — depois clique no tipo de cada um pra ajustar.</div>'
  }

  // Sobe uma lista de arquivos para o dono (col=ait_id|cliente_id|suspensao_id, id).
  async function subirArquivos(files, col, ownerId, btn) {
    const t = await token()
    let ok = 0, falhas = 0
    for (const file of files) {
      if (btn) btn.textContent = `Enviando ${ok + falhas + 1}/${files.length}…`
      try {
        const id = Data.genId('d')
        const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
        const r2Key = PREFIXO[col] + '/' + ownerId + '/' + id + '.' + ext
        const resp = await fetch(WORKER_URL + '/doc?key=' + encodeURIComponent(r2Key), {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + t, 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        })
        if (!resp.ok) throw new Error('worker ' + resp.status)
        const { error } = await db().from('documentos').insert({
          id, [col]: ownerId, tipo: 'Outro',
          nome_arquivo: file.name, r2_key: r2Key,
          tamanho_bytes: file.size, mime: file.type || 'application/octet-stream',
        })
        if (error) throw error
        ok++
      } catch (e) { falhas++; console.error('upload', file.name, e.message) }
    }
    UI.notif(ok + ' anexado(s)' + (falhas ? ', ' + falhas + ' falharam' : '') + '. Ajuste o tipo de cada um.')
    return { ok, falhas }
  }

  async function upload() {
    const input = document.getElementById('doc-file')
    const files = input && input.files ? Array.from(input.files) : []
    if (!files.length) { UI.notif('Escolha um ou mais arquivos', 'error'); return }
    const btn = document.getElementById('doc-up-btn'); if (btn) btn.disabled = true
    await subirArquivos(files, ownerKey(), _owner[ownerKey()], btn)
    refreshTudo()
  }

  // Upload para o CLIENTE (titular) a partir da seção "Documentos do titular".
  async function uploadCliente(clienteId) {
    const input = document.getElementById('doc-file-cli')
    const files = input && input.files ? Array.from(input.files) : []
    if (!files.length) { UI.notif('Escolha um ou mais arquivos', 'error'); return }
    const btn = document.getElementById('doc-up-cli-btn'); if (btn) btn.disabled = true
    await subirArquivos(files, 'cliente_id', clienteId, btn)
    refreshTudo()
  }

  // Tipo inferido pela extensão do nome (a migração gravou mime genérico)
  function tipoMime(nome) {
    const ext = (nome.split('.').pop() || '').toLowerCase()
    if (ext === 'pdf') return 'application/pdf'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image/' + (ext === 'jpg' ? 'jpeg' : ext)
    return ''
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
      const rawBlob = await resp.blob()
      // A migração gravou mime genérico; inferimos pela extensão do nome.
      const mime = tipoMime(data.nome_arquivo) || data.mime || ''
      const blob = mime ? rawBlob.slice(0, rawBlob.size, mime) : rawBlob
      const url = URL.createObjectURL(blob)
      // PDF e imagem abrem no navegador; o resto (Word, Excel, ...) baixa com o nome original
      if (mime === 'application/pdf' || mime.startsWith('image/')) {
        window.open(url, '_blank')
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = data.nome_arquivo || 'documento'
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
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
      refreshTudo()
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  async function setTipo(docId, valor) {
    try {
      const { error } = await db().from('documentos').update({ tipo: valor }).eq('id', docId)
      if (error) throw error
      UI.notif('Tipo atualizado')
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }
  async function renomear(docId, nomeAtual) {
    const novo = prompt('Novo nome do documento:', nomeAtual || '')
    if (novo == null) return
    const v = novo.trim()
    if (!v || v === nomeAtual) return
    try {
      const { error } = await db().from('documentos').update({ nome_arquivo: v }).eq('id', docId)
      if (error) throw error
      UI.notif('Documento renomeado'); refreshTudo()
    } catch (e) { UI.notif('Erro: ' + e.message, 'error') }
  }

  // Documentos do titular (cliente) mostrados dentro de AIT/suspensão.
  // Editáveis (renomear/tipo) igual à lista principal — não mexe no _owner.
  async function renderCliente(containerId, clienteId) {
    const el = document.getElementById(containerId)
    if (!el || !WORKER_URL) return
    _cliRef = { containerId, clienteId }
    const { data, error } = await db().from('documentos').select('*').eq('cliente_id', clienteId).order('created_at')
    if (error) { el.innerHTML = ''; return }
    const tipos = TIPOS.cliente_id
    const esc = s => String(s || '').replace(/'/g, '\\u0027').replace(/"/g, '&quot;')
    const linhas = data.map(d => {
      const lista = tipos.includes(d.tipo) ? tipos : [d.tipo].concat(tipos)
      const opts = lista.map(t => `<option${t === d.tipo ? ' selected' : ''}>${t}</option>`).join('')
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">' +
        '<select class="doc-tipo-sel" onchange="Documentos.setTipo(\'' + d.id + '\',this.value)" title="Tipo do documento">' + opts + '</select>' +
        '<span style="flex:1;font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + d.nome_arquivo + '</span>' +
        '<span class="doc-act" title="Renomear" onclick="Documentos.renomear(\'' + d.id + '\',\'' + esc(d.nome_arquivo) + '\')">✎</span>' +
        '<button class="btn btn-ghost btn-sm" onclick="Documentos.abrir(\'' + d.id + '\')">Abrir</button>' +
        '<button class="btn btn-danger btn-sm" onclick="Documentos.excluir(\'' + d.id + '\')">✕</button>' +
      '</div>'
    }).join('')
    el.innerHTML =
      (data.length ? linhas : '<div style="color:var(--text3);font-size:12px;padding:4px 0">Nenhum documento no cadastro do titular.</div>') +
      '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">' +
        '<input type="file" id="doc-file-cli" multiple style="font-size:12px;flex:1;min-width:160px">' +
        '<button class="btn btn-primary btn-sm" id="doc-up-cli-btn" onclick="Documentos.uploadCliente(\'' + clienteId + '\')">Anexar ao titular</button>' +
      '</div>'
  }

  return { render, renderCliente, upload, uploadCliente, abrir, excluir, renomear, setTipo }
})()
