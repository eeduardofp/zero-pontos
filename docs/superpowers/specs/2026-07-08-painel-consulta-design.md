# Painel Visual da Consulta de Recursos — Design

**Data:** 2026-07-08
**Status:** Aprovado pelo usuário

## Objetivo

Substituir a interação por terminal do executável "Consultar Recursos" por um painel web local com a identidade da Zero Pontos: escolha do escopo com dropdown de clientes/placas, dry-run como chave, progresso ao vivo, gates de login como botões e resultado na própria tela.

## Decisões

1. **Escopo:** painel substitui o terminal por completo (configuração, login, progresso, resultado). CLI atual (`node index.js`) permanece como reserva.
2. **Abordagem:** painel web local — servidor HTTP nativo do Node (sem dependências novas), escutando só em `127.0.0.1:8321`; `.bat` sobe o servidor e abre o navegador padrão.
3. **Logo:** `Redes sociais/Geral/Logo vetorizada.svg` copiada para `automacao/painel/logo.svg`.

## Arquitetura

```
automacao/
  rodada.js          — motor da rodada extraído do index.js (EventEmitter):
                       eventos: inicio(totais), placa(n, placa, resultado[]),
                       aviso(tipo: login|limite, msg), fim(resumo, arqRelatorio)
                       pontos de espera: aguardarConfirmacao() (promise externa)
  index.js           — CLI fino: chama rodada.js, prompts no console (comportamento atual)
  painel.js          — servidor HTTP: static + API + SSE; chama rodada.js
  painel/index.html  — página única (HTML/CSS/JS vanilla, sem build)
  painel/logo.svg    — logo Zero Pontos
  Consultar Recursos.bat — passa a rodar `node painel.js` (abre o navegador sozinho)
```

## API do painel

| Rota | Uso |
|---|---|
| `GET /` e `GET /painel/*` | página e estáticos |
| `GET /api/dados` | clientes e placas com AITs ativas (para o dropdown; busca é client-side com as mesmas regras de `selecao.js`) |
| `POST /api/iniciar` | `{ modo: 'todas'\|'cliente'\|'placa', id, dryRun }` — inicia a rodada (409 se já rodando) |
| `GET /api/eventos` | SSE: `inicio`, `placa`, `aviso`, `fim`, `erro` |
| `POST /api/continuar` | destrava gate de login/troca de conta (substitui o ENTER) |
| `POST /api/parar` | para após a placa atual, salvando relatório parcial |

## UI (uma tela, estados)

1. **Configuração:** logo + título; cartões Todas/Cliente/Placa; busca com dropdown (cliente por nome, placa por texto parcial); chave "Modo teste (dry-run)"; botão Iniciar.
2. **Execução:** barra de progresso (n/total), contadores por tipo (atualizado, sem-mudança, não-encontrado, sem-permissão, dados-inválidos, erro), feed das últimas placas com a coluna Alteração.
3. **Gate:** banner destacado "Faça login no Chrome que abriu e clique Continuar" (login inicial e troca de conta no limite).
4. **Fim:** resumo + tabela completa de resultados; link para o relatório HTML salvo em `logs/`.
5. Botão Parar visível durante a execução.

Estética: fundo claro, cartões com cantos arredondados, verde/vermelho da logo como cores de ação/alerta, fonte system-ui.

## Refactor do motor (rodada.js)

- Lógica movida de `index.js` sem alteração de comportamento: fila por placa, validação/limpeza, bloqueios, retry técnico, classificação de desfecho, pausa por limite (via gate), relatório incremental, gravação Supabase quando não-dry-run.
- Interface: `executar({ alvoIds|null, dryRun, eventos, aguardarConfirmacao })`. `aguardarConfirmacao(tipo, msg)` retorna promise — o CLI resolve com ENTER, o painel com `POST /api/continuar`.
- Pedido de parada: flag `pararAposPlaca` consultada entre placas.

## Tratamento de erros

- Rodada em andamento: `POST /api/iniciar` responde 409.
- Queda do SSE: página reconecta e re-renderiza do último estado (servidor guarda estado corrente da rodada).
- Porta 8321 ocupada: mensagem clara no console e no `.bat` (pause).
- Fechar o painel não mata a rodada; reabrir `localhost:8321` reconecta.

## Testes

- Motor: suíte existente continua cobrindo mapeamento/seleção/bloqueios; `rodada.js` é movimentação de código já validado em produção supervisionada.
- Painel: smoke manual — iniciar dry-run por placa (RYT0A74), verificar progresso, gate de login, resultado e relatório.

## Fora de escopo

- Autenticação no painel (só localhost), multiusuário, execução remota, histórico de rodadas na UI.
