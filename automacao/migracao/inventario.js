// ─── INVENTÁRIO (migração do legado) ─────────────────────────
// Varre o share em SOMENTE LEITURA e monta o plano de migração.
// Nada aqui escreve no share nem no banco.
const fs = require('fs')
const path = require('path')
const M = require('./matching')

const SHARE = '\\\\100.110.210.37\\Zero Pontos'
const MAX_BYTES = 25 * 1024 * 1024

function* andar(dir) {
  let entradas
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }) }
  catch { return } // pasta inacessível: pula, não derruba a varredura
  for (const e of entradas) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* andar(p)
    else yield p
  }
}

// Percorre só a árvore de defesas e devolve o plano: uma linha por arquivo.
function montarPlano(dados, raiz = SHARE) {
  const base = path.join(raiz, '1. NOVO MODELO DEFESAS ADMINISTRATIVAS')
  // Falha ALTO se a raiz não listar: share fora do ar não pode virar
  // silenciosamente um plano vazio (aconteceu em 2026-07-13 à noite).
  fs.readdirSync(base)
  const linhas = []
  // índice de duplicados: docs já no cofre por (dono|nome|tamanho)
  const jaSubidos = new Set(dados.documentos.map(d =>
    [(d.ait_id || d.cliente_id || d.suspensao_id), d.nome_arquivo, d.tamanho_bytes].join('|')))

  for (const abs of andar(base)) {
    const rel = abs.slice(raiz.length + 1)
    const p = M.parseCaminho(rel)
    if (!p) continue
    if (!M.incluirArquivo(p.arquivo)) continue

    let tamanho = 0
    try { tamanho = fs.statSync(abs).size } catch {}

    const linha = {
      caminho: rel, arquivo: p.arquivo, tamanho,
      categoria: p.categoria, ano: p.ano,
      cliente_pasta: p.clientePasta, caso: p.caso || '',
      tipo: M.tipoDocumento(p.arquivo),
      acao: '', destino: '', destino_nome: '', confianca: '', motivo: '',
    }

    const cliente = M.casarClientePorNome(p.clientePasta, dados.clientes)
    if (!cliente) {
      // Decisão 2026-07-14: cliente fora do banco (maioria 2021/22 sem
      // atividade posterior) fica de fora. Cadastrar o cliente no app e
      // re-rodar o dry-run resgata essas linhas automaticamente.
      Object.assign(linha, { acao: 'ignorar', motivo: 'cliente não encontrado no banco' })
      linhas.push(linha); continue
    }
    linha.destino_nome = cliente.nome

    if (tamanho > MAX_BYTES) {
      Object.assign(linha, { acao: 'pular_grande', motivo: `> 25 MB (${(tamanho / 1048576).toFixed(0)} MB)` })
      linhas.push(linha); continue
    }

    let dono = null
    if (!p.caso) {
      // arquivo solto na pasta do cliente (CNH, CRLV, procuração...)
      dono = { col: 'cliente_id', id: cliente.id, conf: 'alta' }
    } else if (p.categoria === 'suspensao') {
      const r = M.casarSuspensao(p.caso, cliente.id, dados.suspensoes)
      if (r) dono = { col: 'suspensao_id', id: r.suspensao.id, conf: r.confianca }
    } else {
      const r = M.casarAIT(p.caso, cliente.id, dados)
      if (r) dono = { col: 'ait_id', id: r.ait.id, conf: r.confianca }
    }

    if (!dono) {
      // Decisão 2026-07-14: caso sem código casado → só CNH/CRLV sobem,
      // anexados no CLIENTE; o resto do caso duvidoso fica de fora.
      if (linha.tipo === 'CNH' || linha.tipo === 'CRLV') {
        const chaveDupCli = [cliente.id, p.arquivo, tamanho].join('|')
        Object.assign(linha, {
          acao: jaSubidos.has(chaveDupCli) ? 'ja_subido' : 'subir',
          destino: 'cliente_id:' + cliente.id, confianca: 'alta',
          motivo: 'documento do titular — caso sem código casado',
        })
      } else {
        Object.assign(linha, { acao: 'ignorar', motivo: 'caso sem código casado' })
      }
      linhas.push(linha); continue
    }

    const chaveDup = [dono.id, p.arquivo, tamanho].join('|')
    Object.assign(linha, {
      acao: jaSubidos.has(chaveDup) ? 'ja_subido' : (dono.conf === 'alta' ? 'subir' : 'revisar'),
      destino: dono.col + ':' + dono.id,
      confianca: dono.conf,
      motivo: dono.conf === 'ambigua' ? 'mais de um destino possível' : '',
    })
    linhas.push(linha)
  }
  return linhas
}

// CSV com ; e BOM — abre certo no Excel PT-BR
function gravarCSV(linhas, arquivo) {
  const cols = ['acao', 'confianca', 'tipo', 'destino', 'destino_nome', 'categoria', 'ano',
                'cliente_pasta', 'caso', 'arquivo', 'tamanho', 'motivo', 'caminho']
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
  const csv = '﻿' + cols.join(';') + '\n' +
    linhas.map(l => cols.map(c => esc(l[c])).join(';')).join('\n')
  fs.writeFileSync(arquivo, csv, 'utf8')
}

function lerCSV(arquivo) {
  const txt = fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '')
  const [cab, ...rows] = txt.split(/\r?\n/).filter(Boolean)
  const parse = linha => {
    const vals = []
    let cur = '', dentro = false
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i]
      if (dentro) {
        if (ch === '"' && linha[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') dentro = false
        else cur += ch
      } else if (ch === '"') dentro = true
      else if (ch === ';') { vals.push(cur); cur = '' }
      else cur += ch
    }
    vals.push(cur)
    return vals
  }
  const cols = parse(cab)
  return rows.map(r => {
    const vals = parse(r)
    const o = {}
    cols.forEach((c, i) => { o[c] = vals[i] == null ? '' : vals[i] })
    o.tamanho = parseInt(o.tamanho, 10) || 0
    return o
  })
}

module.exports = { montarPlano, gravarCSV, lerCSV, andar, SHARE, MAX_BYTES }
