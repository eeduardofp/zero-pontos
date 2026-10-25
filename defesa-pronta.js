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

  // HTML da tag, igual na Fila de recursos e na tela Hoje.
  // tipo: 'ait' | 'suspensao' (o que toggleDefesaPronta espera).
  function tagHtml(tipo, id, marcadaEtapa, proximaEtapa) {
    const pronta = estado(marcadaEtapa, proximaEtapa) === 'pronta'
    const alternar = "toggleDefesaPronta('" + tipo + "','" + id + "')"
    return '<span class="tag-defesa ' + (pronta ? 'ok' : 'no') + '" role="button" tabindex="0"' +
      ' aria-label="Defesa ' + (pronta ? 'pronta' : 'pendente') + '. Clique para alternar"' +
      ' onclick="' + alternar + '"' +
      ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();' + alternar + '}">' +
      (pronta ? 'Pronta' : 'Pendente') + '</span>'
  }

  return { estado, contar, tagHtml }
})()

if (typeof module !== 'undefined' && module.exports) module.exports = DefesaPronta
