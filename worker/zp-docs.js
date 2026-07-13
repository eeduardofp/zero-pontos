// ─── zp-docs ─────────────────────────────────────────────────
// Proxy autenticado entre o AIT Control e o bucket R2 (zero-pontos-docs).
// Deploy: Cloudflare Dashboard → Workers → colar este arquivo.
// Binding obrigatório: R2 bucket "zero-pontos-docs" com nome de variável DOCS.
// Sem segredos: valida o JWT do usuário contra o Supabase Auth.

const SUPABASE_URL = 'https://ujftnixonlscpbfhnnnr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Q6P3CW3b7c0P1ENbvL1FFA_l60Ad-pA'
const ALLOWED_ORIGINS = [
  'https://app.zeropontos.com.br',
  'https://eeduardofp.github.io',
]
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB por arquivo

function corsHeaders(origin) {
  const o = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Vary': 'Origin',
  }
}

async function autenticado(request) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return false
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_KEY, Authorization: auth },
  })
  return r.status === 200
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const headers = corsHeaders(request.headers.get('Origin') || '')

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (url.pathname !== '/doc') return new Response('not found', { status: 404, headers })

    const key = url.searchParams.get('key') || ''
    // chave sempre no formato prefixo/id-do-dono/arquivo — nada de path traversal
    if (!/^(aits|clientes|suspensoes)\/[A-Za-z0-9._\-]+\/[A-Za-z0-9._\-]+$/.test(key)) {
      return new Response('chave inválida', { status: 400, headers })
    }
    if (!(await autenticado(request))) {
      return new Response('não autorizado', { status: 401, headers })
    }

    if (request.method === 'GET') {
      const obj = await env.DOCS.get(key)
      if (!obj) return new Response('não encontrado', { status: 404, headers })
      return new Response(obj.body, {
        headers: {
          ...headers,
          'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, max-age=60',
        },
      })
    }

    if (request.method === 'PUT') {
      const len = parseInt(request.headers.get('Content-Length') || '0', 10)
      if (len > MAX_BYTES) return new Response('arquivo acima de 25 MB', { status: 413, headers })
      await env.DOCS.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/pdf' },
      })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    if (request.method === 'DELETE') {
      await env.DOCS.delete(key)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    return new Response('método não suportado', { status: 405, headers })
  },
}
