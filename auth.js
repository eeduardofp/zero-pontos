// ─── AUTH ────────────────────────────────────────────────────
const Auth = (() => {
  let _client = null

  function client() {
    if (!_client) _client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    return _client
  }

  async function login(email, password) {
    const { data, error } = await client().auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function logout() {
    await client().auth.signOut()
    window.location.href = 'index.html'
  }

  async function getSession() {
    const { data } = await client().auth.getSession()
    return data.session
  }

  async function requireAuth() {
    const session = await getSession()
    if (!session) {
      window.location.href = 'index.html'
      return null
    }
    return session
  }

  function getClient() {
    return client()
  }

  return { login, logout, getSession, requireAuth, getClient }
})()
