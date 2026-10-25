// ─── TAG "PRONTA / PENDENTE" DA FILA DE RECURSOS ─────────────
// Lógica pura (sem DOM, sem banco). Também carregável em Node para testes.
const DefesaPronta = (() => {
  // "pronta" só se a defesa foi marcada para a MESMA etapa que está pendente
  // agora. Se a AIT avançou de etapa, a marcação antiga deixa de valer.
  function estado(marcadaEtapa, proximaEtapa) {
    return marcadaEtapa && proximaEtapa && marcadaEtapa === proximaEtapa ? 'pronta' : 'pendente'
  }

  // itens: [{ marcada, prox }]
  function contar(itens) {
    let prontas = 0
    for (const i of itens) if (estado(i.marcada, i.prox) === 'pronta') prontas++
    return { prontas, pendentes: itens.length - prontas }
  }

  return { estado, contar }
})()

if (typeof module !== 'undefined' && module.exports) module.exports = DefesaPronta
