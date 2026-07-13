# Design: exclusão de oportunidade, prazo automático, fila unificada, relatório de cliente

Data: 2026-07-13
Contexto: workspace principal (app.html/app.js/data.js/comercial.js/suspensoes.js), sem alteração na automação.

## 1. Excluir oportunidade comercial

`comercial.js` ganha `excluirOportunidade(id)`, chamada por um botão "Excluir" no modal de detalhe (`abrirDetalhe`), ao lado de "Editar". Mesmo padrão já usado em `excluirAIT`/`excluirPlaca`/`excluirCliente` (app.js):

```js
async function excluirOportunidade(id) {
  if (!confirm('Excluir esta oportunidade? Esta ação não pode ser desfeita.')) return
  const { error } = await db().from('oportunidades').delete().eq('id', id)
  if (error) { UI.notif('Erro: ' + error.message, 'error'); return }
  ops = ops.filter(o => o.id !== id)
  UI.closeModal()
  await render()
  UI.notif('Oportunidade excluída!')
}
```

Disponível em qualquer status (Aberta/Em negociação/Convertida/Perdida). Não bloqueia nada — se a oportunidade já foi convertida, a AIT gerada continua intacta (só o registro da oportunidade em si é removido).

## 2. Prazo automático ao protocolar (AITs)

Sem mudança de schema. `vencimento` continua um campo único por AIT, representando **o prazo da etapa que está pendente agora** (calculado por `Data.proximaEtapa`/`Data.precisaRecurso`, já existentes em `data.js` — não mudam).

Mudança em `app.js`:
- `openRecurso(aid)`: remove o campo manual "Novo prazo" (input `rv-venc`) do modal. O aviso passa a dizer algo como: "Ao confirmar, **{prox}** será marcado como **Aguardando** e o prazo atual será limpo."
- `confirmarRecurso(aid, etKey)`: em vez de ler `rv-venc`, sempre grava `fields.vencimento = null` junto com `fields[etKey] = 'Aguardando'`.

Efeito: AIT sai da Fila de recursos assim que protocolada (já é o comportamento hoje, via `precisaRecurso`), e o prazo antigo não fica "grudado" mostrando urgência falsa em nenhuma outra tela (Kanban, exports, etc.), porque o campo realmente fica vazio.

Isso já é simétrico com o que a automação faz: quando o site mostra uma etapa recém-indeferida, `mapeamento.js` grava um `vencimento` novo (prazo da próxima etapa). O ciclo fecha: automação preenche quando indefere, "Protocolar" limpa quando o usuário resolve.

## 3. Fila de recursos unificada (AITs + Suspensões)

### 3.1 Lógica de pendência para Suspensões

`suspensoes.js` ganha duas funções espelhando `data.js`:

Só entra na fila com etapa indeferida **e** prazo conhecido (`vencimento_jari`/`vencimento_cetran` preenchido) — indeferida sem prazo ainda (automação não trouxe a data do site) fica de fora, evita lista poluída com pendência sem data real.

```js
function precisaRecurso(s) {
  if (s.encerrado) return false
  const defInd = s.defesa_previa === 'Indeferido'
  const jariVaz = !s.jari || s.jari === 'Não realizado'
  const jariInd = s.jari === 'Indeferido'
  const cetranVaz = !s.cetran || s.cetran === 'Não realizado'
  if (defInd && jariVaz) return !!s.vencimento_jari
  if (jariInd && cetranVaz) return !!s.vencimento_cetran
  return false
}

function proximaEtapa(s) {
  if (s.defesa_previa === 'Indeferido' && (!s.jari || s.jari === 'Não realizado')) return 'JARI'
  if (s.jari === 'Indeferido' && (!s.cetran || s.cetran === 'Não realizado')) return 'CETRAN'
  return null
}
```

Suspensões **mantêm** os dois campos que já têm (`vencimento_jari`, `vencimento_cetran` — sem mudança de schema). `Protocolar` limpa o campo certo conforme a transição: indo pra JARI limpa `vencimento_jari`; indo pra CETRAN limpa `vencimento_cetran`.

### 3.2 Item de pendência genérico

`app.js` monta a fila combinando as duas fontes num formato comum:

```js
function getFilaRecursos() {
  const aitItens = Data.getAITs().filter(Data.precisaRecurso).map(a => {
    const pl = Data.gPlaca(a.placa_id), cl = pl ? Data.gCliente(pl.cliente_id) : null
    return {
      tipo: 'ait', id: a.id,
      cliente: cl ? cl.nome : '—',
      identificador: pl ? `${pl.placa} · ${pl.renavan}` : '—',
      codigo: a.codigo, enquadramento: a.enquadramento || '—',
      prox: Data.proximaEtapa(a), prazo: a.vencimento
    }
  })
  const susItens = Suspensoes.getPendentes().map(s => {
    const cl = Data.gCliente(s.cliente_id)
    const prox = Suspensoes.proximaEtapa(s)
    return {
      tipo: 'suspensao', id: s.id,
      cliente: cl ? cl.nome : '—',
      identificador: `Processo ${s.processo}`,
      codigo: s.processo, enquadramento: 'Suspensão do direito de dirigir',
      prox, prazo: prox === 'JARI' ? s.vencimento_jari : s.vencimento_cetran
    }
  })
  const porUrgencia = (a, b) => (Data.daysUntil(a.prazo) ?? 9999) - (Data.daysUntil(b.prazo) ?? 9999)
  return [...susItens.sort(porUrgencia), ...aitItens.sort(porUrgencia)]
}
```

Suspensão sempre vem antes de AIT na lista (ordenadas por urgência só entre si); AITs vêm depois, também ordenadas por urgência entre si.

`Suspensoes.getPendentes()` é um getter novo em `suspensoes.js` que filtra `lista` (o cache do módulo) por `precisaRecurso`. **Detalhe de carregamento:** como Suspensões é uma página separada, seu cache pode estar vazio se o usuário for direto pra "Fila de recursos" sem passar por "Suspensões" antes. `renderRecursos()` precisa garantir o carregamento (`await Suspensoes.loadSuspensoes()` se a lista interna estiver vazia) antes de montar a fila.

### 3.3 Render da tabela

Linha da fila fica genérica, com uma tag visual quando `tipo === 'suspensao'` (ex: badge laranja "⚠ CNH" antes do nome do cliente ou do identificador). Coluna "Recurso" mostra `prox` (JARI/2ª Instância/CETRAN), coluna "Prazo" mostra `prazo` formatado, botão "Protocolar" chama `openRecurso(id)` ou `openRecursoSus(id)` conforme o `tipo`.

`openRecursoSus`/`confirmarRecursoSus` espelham `openRecurso`/`confirmarRecurso`, mas gravam no campo de status certo (`jari` ou `cetran`) e limpam o campo de vencimento certo (`vencimento_jari` ou `vencimento_cetran`).

## 4. Relatório de cliente (Excel)

Botão "Gerar relatório" no modal do cliente (`openCliente`, ao lado de "Editar"/"Excluir"). Chama `gerarRelatorioCliente(cid)`, que monta um `.xlsx` via `downloadExcel()` (já existe, SheetJS).

### 4.1 Conteúdo

Uma aba única, em blocos (linhas de seção + linhas em branco entre elas):

1. **Cabeçalho**: nome do cliente, data de geração
2. **AITs em andamento** (ativas): Código | Enquadramento | Placa | Etapa atual | Status | Prazo | **O que fazer**
3. **Resumo de AITs encerradas**: Resultado | Quantidade (linhas "Deferidas" / "Indeferidas", contagem — sem listar uma a uma)
4. **Suspensão de CNH** (só se o cliente tiver uma ativa): Processo | Etapa atual | Status | Prazo | O que fazer

Se o cliente não tiver nenhuma AIT nem suspensão, gera relatório mínimo com aviso "Nenhuma AIT ou suspensão vinculada".

### 4.2 Coluna "O que fazer" (linguagem simples)

Reaproveita `precisaRecurso`/`proximaEtapa` (as mesmas funções da fila) — nenhuma regra de negócio nova. Para AIT, o prazo é sempre `a.vencimento`; para Suspensão, é `s.vencimento_jari` quando `proximaEtapa(s) === 'JARI'` ou `s.vencimento_cetran` quando `=== 'CETRAN'` (mesma seleção já usada em `getFilaRecursos`):

```js
function oQueFazer(precisa, prox, prazo) {
  if (!precisa) return 'Aguardando decisão — nenhuma ação necessária no momento'
  return prazo
    ? `⚠ Protocolar recurso na ${prox} até ${Data.fmtData(prazo)}`
    : `⚠ Protocolar recurso na ${prox} — prazo a definir`
}
// AIT:      oQueFazer(Data.precisaRecurso(a), Data.proximaEtapa(a), a.vencimento)
// Suspensão: oQueFazer(Suspensoes.precisaRecurso(s), Suspensoes.proximaEtapa(s), prazoDaEtapa(s))
```

Nome do arquivo: `Relatorio_<Nome_do_Cliente>_<data>.xlsx` (nome do cliente sanitizado pra remover caracteres inválidos em nome de arquivo).

## Testes / verificação

Sem framework de teste automatizado no workspace principal (só `automacao/` tem `node:test`). Verificação manual no navegador, como já foi feito pra outras mudanças no app:
- Excluir oportunidade em cada status, confirmar que some da lista e do Supabase
- Protocolar um recurso de AIT com prazo preenchido → confirmar que `vencimento` fica `null` e a AIT some da Fila de recursos
- Mesma checagem pra Suspensão (JARI e CETRAN separadamente)
- Fila de recursos com AIT + Suspensão pendentes ao mesmo tempo → confirmar ordem (suspensão sempre no topo) e tag visual
- Gerar relatório de um cliente com AITs ativas + encerradas + suspensão ativa → abrir o `.xlsx` e conferir as 4 seções e o texto de "O que fazer"
- Gerar relatório de um cliente sem nada vinculado → não deve quebrar
