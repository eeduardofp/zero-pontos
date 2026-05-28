// ─── DATA ─────────────────────────────────────────────────────
// Estado local (cache) + helpers de negócio
const Data = (() => {
  let clientes = []
  let placas = []
  let aits = []

  // ── CACHE ────────────────────────────────────────────────
  function load(db) {
    clientes = db.clientes || []
    placas   = db.placas   || []
    aits     = db.aits     || []
  }

  function getClientes() { return clientes }
  function getPlacas()   { return placas }
  function getAITs()     { return aits }

  function gCliente(id) { return clientes.find(c => c.id === id) || null }
  function gPlaca(id)   { return placas.find(p => p.id === id) || null }
  function gAIT(id)     { return aits.find(a => a.id === id) || null }

  function placasDe(cid) { return placas.filter(p => p.cliente_id === cid) }
  function aitsDe(cid) {
    const pids = placasDe(cid).map(p => p.id)
    return aits.filter(a => pids.includes(a.placa_id))
  }
  function aitsDaPlaca(pid) { return aits.filter(a => a.placa_id === pid) }

  // ── MUTAÇÕES NO CACHE ────────────────────────────────────
  function addCliente(c) { clientes.push(c); clientes.sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR')) }
  function addPlaca(p)   { placas.push(p) }
  function addAIT(a)     { aits.unshift(a) }

  function updateAITCache(id, fields) {
    const idx = aits.findIndex(a => a.id === id)
    if (idx >= 0) aits[idx] = { ...aits[idx], ...fields }
  }

  function updateClienteCache(id, fields) {
    const idx = clientes.findIndex(c => c.id === id)
    if (idx >= 0) clientes[idx] = { ...clientes[idx], ...fields }
  }

  // ── LÓGICA DE NEGÓCIO ─────────────────────────────────────
  function etapaAtual(a) {
    if (a.encerrado) return 'Encerrado'
    const def = a.defesa_previa || ''
    const jar = a.jari || ''
    const seg = a.segunda_instancia || ''
    if (!def || def === 'Aguardando' || def === 'Não realizado') return 'Defesa Prévia'
    if (def === 'Deferido') return 'Encerrado'
    if (def === 'Indeferido') {
      if (!jar || jar === 'Aguardando' || jar === 'Não realizado') return 'JARI'
      if (jar === 'Deferido') return 'Encerrado'
      if (jar === 'Indeferido') {
        if (!seg || seg === 'Aguardando' || seg === 'Não realizado') return '2ª Instância'
        return 'Encerrado'
      }
    }
    return 'Defesa Prévia'
  }

  function statusAtual(a) {
    const et = etapaAtual(a)
    if (et === 'Defesa Prévia') return a.defesa_previa || 'Aguardando'
    if (et === 'JARI')          return a.jari          || 'Aguardando'
    if (et === '2ª Instância')  return a.segunda_instancia || 'Aguardando'
    if (et === 'Encerrado') {
      if (a.defesa_previa === 'Deferido' || a.jari === 'Deferido' || a.segunda_instancia === 'Deferido') return 'Deferido'
      return 'Indeferido'
    }
    return 'Aguardando'
  }

  function deveEncerrar(a) {
    return a.defesa_previa === 'Deferido' ||
           a.jari === 'Deferido' ||
           a.segunda_instancia === 'Deferido' ||
           a.segunda_instancia === 'Indeferido'
  }

  function precisaRecurso(a) {
    if (a.encerrado) return false
    const defInd  = a.defesa_previa === 'Indeferido'
    const jariVaz = !a.jari || a.jari === '' || a.jari === 'Não realizado'
    const jariInd = a.jari === 'Indeferido'
    const segVaz  = !a.segunda_instancia || a.segunda_instancia === '' || a.segunda_instancia === 'Não realizado'
    return (defInd && jariVaz) || (jariInd && segVaz)
  }

  function proximaEtapa(a) {
    if (a.defesa_previa === 'Indeferido' && (!a.jari || a.jari === '' || a.jari === 'Não realizado')) return 'JARI'
    if (a.jari === 'Indeferido' && (!a.segunda_instancia || a.segunda_instancia === '' || a.segunda_instancia === 'Não realizado')) return '2ª Instância'
    return null
  }

  // ── DATAS ─────────────────────────────────────────────────
  function daysSince(d) {
    if (!d) return 999
    const diff = Date.now() - new Date(d).getTime()
    if (isNaN(diff)) return 999
    return Math.floor(diff / 86400000)
  }

  function daysUntil(d) {
    if (!d) return null
    const diff = new Date(d).getTime() - Date.now()
    if (isNaN(diff)) return null
    return Math.floor(diff / 86400000)
  }

  function today() {
    return new Date().toISOString().split('T')[0]
  }

  function genId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  }

  function fmtData(d) {
    if (!d) return '—'
    return d.split('-').reverse().join('/')
  }

  function fmtMoeda(v) {
    return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  }

  // ── URGÊNCIA KANBAN ───────────────────────────────────────
  function urgScore(a) {
    const v = daysUntil(a.vencimento)
    const d = daysSince(a.ultima_att)
    if (v !== null && v < 0) return 0
    if ((v !== null && v <= 7) || d >= 21) return 1
    if ((v !== null && v <= 30) || d >= 10) return 2
    return 3
  }

  function urgLabel(venc) {
    const d = daysUntil(venc)
    if (d === null) return { t: 'Sem prazo', c: 'b-na', o: 9 }
    if (d < 0)      return { t: 'Vencido', c: 'b-no', o: 0 }
    if (d <= 7)     return { t: d + 'd restantes', c: 'b-no', o: 1 }
    if (d <= 21)    return { t: d + 'd restantes', c: 'b-wait', o: 2 }
    return { t: d + 'd restantes', c: 'b-ok', o: 3 }
  }

  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  return {
    load,
    getClientes, getPlacas, getAITs,
    gCliente, gPlaca, gAIT,
    placasDe, aitsDe, aitsDaPlaca,
    addCliente, addPlaca, addAIT,
    updateAITCache, updateClienteCache,
    etapaAtual, statusAtual, deveEncerrar,
    precisaRecurso, proximaEtapa,
    daysSince, daysUntil, today, genId,
    fmtData, fmtMoeda, urgScore, urgLabel,
    MESES
  }
})()
