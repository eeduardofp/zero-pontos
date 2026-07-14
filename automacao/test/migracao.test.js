const test = require('node:test')
const assert = require('node:assert')
const M = require('../migracao/matching')

test('parseCaminho identifica níveis da árvore de defesas', () => {
  const p = M.parseCaminho('1. NOVO MODELO DEFESAS ADMINISTRATIVAS\\Defesas 2025\\ADAILTON MARQUES SANTOS\\160. Cetran. JARI. Defesa JL01338914\\Recurso JARI.doc')
  assert.equal(p.categoria, 'defesa')
  assert.equal(p.ano, 2025)
  assert.equal(p.cliente, 'ADAILTON MARQUES SANTOS')
  assert.equal(p.caso, '160. Cetran. JARI. Defesa JL01338914')
  assert.equal(p.arquivo, 'Recurso JARI.doc')
})

test('parseCaminho: arquivo dentro de subpasta do caso mantém o caso', () => {
  const p = M.parseCaminho('1. NOVO MODELO DEFESAS ADMINISTRATIVAS\\Defesas 2025\\ADAILTON MARQUES SANTOS\\1. Defesa P0DGX00043\\Documentos\\AIT.pdf')
  assert.equal(p.caso, '1. Defesa P0DGX00043')
  assert.equal(p.arquivo, 'AIT.pdf')
})

test('parseCaminho: arquivo no nível do cliente tem caso null', () => {
  const p = M.parseCaminho('1. NOVO MODELO DEFESAS ADMINISTRATIVAS\\Defesas 2025\\ADAILTON MARQUES SANTOS\\CNH.pdf')
  assert.equal(p.caso, null)
  assert.equal(p.arquivo, 'CNH.pdf')
})

test('parseCaminho: suspensão vira categoria suspensao', () => {
  const p = M.parseCaminho('1. NOVO MODELO DEFESAS ADMINISTRATIVAS\\Suspensão CNH 2023\\12. MOACIR ROECKER\\Defesa.doc')
  assert.equal(p.categoria, 'suspensao')
  assert.equal(p.cliente, 'MOACIR ROECKER')
})

test('parseCaminho: recusa bafômetro é categoria defesa', () => {
  const p = M.parseCaminho('1. NOVO MODELO DEFESAS ADMINISTRATIVAS\\Recusa Bafometro 2024\\9. LARISSA BECKER DEMATTE\\NA.pdf')
  assert.equal(p.categoria, 'defesa')
  assert.equal(p.cliente, 'LARISSA BECKER DEMATTE')
})

test('parseCaminho: fora da árvore de defesas retorna null', () => {
  assert.equal(M.parseCaminho('ZERO PONTOS\\Modelo de Documentos\\x.pdf'), null)
})

test('limparNomeCliente remove numeração e qualificadores após ponto', () => {
  assert.equal(M.limparNomeCliente('12. MOACIR ROECKER'), 'MOACIR ROECKER')
  assert.equal(M.limparNomeCliente('DANIEL OSMAR ADELINO. Balantec'), 'DANIEL OSMAR ADELINO')
  assert.equal(M.limparNomeCliente('ANTÔNIO ROMEU LOPES'), 'ANTONIO ROMEU LOPES')
})

test('limparNomeCliente ignora prefixos de etapa/ano e sufixos numéricos', () => {
  assert.equal(M.limparNomeCliente('CETRAN 2026. GABRIELI MARIA GIRARDI. 254444.2023'), 'GABRIELI MARIA GIRARDI')
  assert.equal(M.limparNomeCliente('CETRAN. 2026. LEANDRO ALVINO PISKE. N. 97812.2021'), 'LEANDRO ALVINO PISKE')
  assert.equal(M.limparNomeCliente('3. JARI. 2026. JOSIAS CESAR GONÇALVES'), 'JOSIAS CESAR GONCALVES')
})

test('casarClientePorNome: subconjunto de palavras casa grafias com nomes a mais/menos', () => {
  const clientes = [
    { id: 'c1', nome: 'ANTONIO ROMEU LOPES NETO' },
    { id: 'c2', nome: 'MOACIR ROECKER' },
  ]
  // pasta traz SCHEFFER a mais — palavras do banco ⊂ palavras da pasta
  assert.equal(M.casarClientePorNome('ANTÔNIO ROMEU SCHEFFER LOPES NETO', clientes).id, 'c1')
  // empate ou pouco em comum continua null
  assert.equal(M.casarClientePorNome('ANTONIO SILVA', clientes), null)
})

test('casarClientePorNome: abreviação com ponto no banco não quebra o subset', () => {
  const clientes = [{ id: 'c1', nome: 'ANTÔNIO ROMEU S. LOPES NETO' }]
  assert.equal(M.casarClientePorNome('ANTÔNIO ROMEU SCHEFFER LOPES NETO', clientes).id, 'c1')
})

test('casarClientePorNome: tolera 1 letra divergente (LUIS/LUIZ)', () => {
  const clientes = [
    { id: 'c1', nome: 'MARCIO LUIZ BORTOLINI' },
    { id: 'c2', nome: 'RICARDO LUIZ BORTOLINI' },
  ]
  assert.equal(M.casarClientePorNome('MARCIO LUIS BORTOLINI. Ivanir', clientes).id, 'c1')
})

test('incluirArquivo aceita pdf/word/imagem/planilha e recusa lixo', () => {
  assert.ok(M.incluirArquivo('Defesa.doc'))
  assert.ok(M.incluirArquivo('CNH.jpeg'))
  assert.ok(M.incluirArquivo('AIT.PDF'))
  assert.ok(M.incluirArquivo('controle.xlsx'))
  assert.ok(!M.incluirArquivo('Thumbs.db'))
  assert.ok(!M.incluirArquivo('atalho.lnk'))
  assert.ok(!M.incluirArquivo('backup.zip'))
})

test('tipoDocumento classifica pelo nome', () => {
  assert.equal(M.tipoDocumento('NA.pdf'), 'NA')
  assert.equal(M.tipoDocumento('NP.jpeg'), 'NP')
  assert.equal(M.tipoDocumento('AIT.pdf'), 'AIT')
  assert.equal(M.tipoDocumento('Defesa Prévia.PDF.pdf'), 'Defesa')
  assert.equal(M.tipoDocumento('Recurso JARI.doc'), 'Defesa')
  assert.equal(M.tipoDocumento('Parecer indeferimento.pdf'), 'Parecer')
  assert.equal(M.tipoDocumento('Protocolo e Senha.jpeg'), 'Comprovante')
  assert.equal(M.tipoDocumento('Comprovante_884.pdf'), 'Comprovante')
  assert.equal(M.tipoDocumento('CNH.pdf'), 'CNH')
  assert.equal(M.tipoDocumento('CRLv 1.pdf'), 'CRLV')
  assert.equal(M.tipoDocumento('Procuração assinada.pdf'), 'Procuracao')
  assert.equal(M.tipoDocumento('Notificacao autuacao.pdf'), 'NA')
  assert.equal(M.tipoDocumento('foto local.png'), 'Outro')
})

test('casarClientePorNome: exato > prefixo > null', () => {
  const clientes = [
    { id: 'c1', nome: 'ADAILTON MARQUES SANTOS' },
    { id: 'c2', nome: 'MOACIR ROECKER' },
    { id: 'c3', nome: 'MARCIO FELIPE CUSTODIO' },
  ]
  assert.equal(M.casarClientePorNome('ADAILTON MARQUES SANTOS', clientes).id, 'c1')
  assert.equal(M.casarClientePorNome('12. MOACIR ROECKER', clientes).id, 'c2')
  assert.equal(M.casarClientePorNome('MARCIO FELIPE CUSTODIO. Placas RYT', clientes).id, 'c3')
  assert.equal(M.casarClientePorNome('FULANO INEXISTENTE', clientes), null)
})

test('casarAIT: código no nome do caso casa com a AIT do cliente', () => {
  const clientes = [{ id: 'c1', nome: 'ADAILTON MARQUES SANTOS' }]
  const placas = [{ id: 'p1', cliente_id: 'c1' }]
  const aits = [
    { id: 'a1', codigo: 'JL01338914', placa_id: 'p1' },
    { id: 'a2', codigo: 'JV00159575', placa_id: 'p1' },
  ]
  const r = M.casarAIT('160. Cetran. JARI. Defesa JL01338914', 'c1', { aits, placas, clientes })
  assert.equal(r.ait.id, 'a1')
  assert.equal(r.confianca, 'alta')
})

test('casarAIT: cidade no nome da pasta não gera falso-ambíguo', () => {
  const clientes = [{ id: 'c1', nome: 'JONATHAS ALVARES' }]
  const placas = [{ id: 'p1', cliente_id: 'c1' }]
  const aits = [
    { id: 'a1', codigo: 'GUARAMIRIM-000123-P09FW000KC-1234-0', placa_id: 'p1' },
    { id: 'a2', codigo: 'GUARAMIRIM-000124-P09FW000KD-1234-0', placa_id: 'p1' },
  ]
  const r = M.casarAIT('JARI. P09FW000KC. Jonatha. GUARAMIRIM', 'c1', { aits, placas, clientes })
  assert.equal(r.ait.id, 'a1')
  assert.equal(r.confianca, 'alta')
})

test('casarAIT: sem código que case retorna null', () => {
  const clientes = [{ id: 'c1', nome: 'X' }]
  const placas = [{ id: 'p1', cliente_id: 'c1' }]
  const aits = [{ id: 'a1', codigo: 'JL01338914', placa_id: 'p1' }]
  assert.equal(M.casarAIT('1. Defesa SEMCODIGO999', 'c1', { aits, placas, clientes }), null)
})

test('casarSuspensao: única suspensão do cliente é alta', () => {
  const sus = [{ id: 's1', cliente_id: 'c1', processo: 'PROC123456' }]
  const r = M.casarSuspensao('Recurso JARI', 'c1', sus)
  assert.equal(r.suspensao.id, 's1')
  assert.equal(r.confianca, 'alta')
})

test('casarSuspensao: processo no nome do caso desempata', () => {
  const sus = [
    { id: 's1', cliente_id: 'c1', processo: 'PROC111111' },
    { id: 's2', cliente_id: 'c1', processo: 'PROC222222' },
  ]
  const r = M.casarSuspensao('Defesa PROC222222', 'c1', sus)
  assert.equal(r.suspensao.id, 's2')
  assert.equal(r.confianca, 'alta')
})

test('casarSuspensao: sem processo, uma só ATIVA → casa nela com alta', () => {
  const sus = [
    { id: 's1', cliente_id: 'c1', processo: 'PROC111111', encerrado: true },
    { id: 's2', cliente_id: 'c1', processo: 'PROC222222', encerrado: false },
  ]
  const r = M.casarSuspensao('Defesa', 'c1', sus)
  assert.equal(r.suspensao.id, 's2')
  assert.equal(r.confianca, 'alta')
})

test('casarSuspensao: sem processo, duas ativas → ambígua', () => {
  const sus = [
    { id: 's1', cliente_id: 'c1', processo: 'PROC111111', encerrado: false },
    { id: 's2', cliente_id: 'c1', processo: 'PROC222222', encerrado: false },
  ]
  const r = M.casarSuspensao('Defesa', 'c1', sus)
  assert.equal(r.confianca, 'ambigua')
})
