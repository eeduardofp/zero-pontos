// Smoke test manual da navegação: node smoke-detran.js PLACA RENAVAM
const D = require('./detran.js')

async function main() {
  const [placa, renavam] = process.argv.slice(2)
  if (!placa || !renavam) { console.log('Uso: node smoke-detran.js PLACA RENAVAM'); process.exit(1) }
  const { ctx, page } = await D.abrirBrowser()
  console.log('abrindo dossiê...')
  await D.abrirDossie(page, placa, renavam)
  console.log('url:', page.url())
  console.log('accordions:', await page.locator(D.SEL.accordion).count())
  console.log('permissão negada?', await D.isPermissaoNegada(page))
  console.log('recursos:', JSON.stringify(await D.todosRecursos(page), null, 1))
  console.log('débitos:', JSON.stringify(await D.todosDebitos(page), null, 1))
  await page.screenshot({ path: 'logs/smoke-final.png', fullPage: true })
  // salva fixture para o suite de testes
  const fs = require('fs')
  fs.mkdirSync('fixtures', { recursive: true })
  fs.writeFileSync(`fixtures/dossie-${placa}.html`, await page.content())
  console.log(`fixture salva: fixtures/dossie-${placa}.html`)
  await ctx.close()
}
main().catch(e => { console.error(e); process.exit(1) })
