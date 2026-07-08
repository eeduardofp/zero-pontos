# Automação "Consulta de Recursos" — Design

**Data:** 2026-07-08
**Status:** Aprovado pelo usuário (com ressalva: site do Detran é hostil a automação — validar na Etapa 0)

## Objetivo

Automatizar a verificação de status dos recursos de infração no Detran Digital SC e a atualização dos cards (AITs) no workspace Zero Pontos. Hoje o processo é manual: para cada card da fila de verificação, consulta-se o dossiê do veículo no site do Detran e atualiza-se o status no workspace.

## Contexto do sistema existente

- Workspace: app web estático (repo `eeduardofp/zero-pontos`), dados no Supabase (`https://ujftnixonlscpbfhnnnr.supabase.co`), tabelas `clientes`, `placas`, `aits`. Auth por email/senha (Supabase Auth).
- AIT possui campos de etapa: `defesa_previa`, `jari`, `segunda_instancia` (valores: `Aguardando`, `Deferido`, `Indeferido`, `Não realizado`, vazio), além de `encerrado`, `vencimento`, `ultima_att`, `codigo`, `placa_id`, `ano`.
- Fila de verificação (aba do app): AITs não encerradas com `ultima_att` ≥ 10 dias.
- Consulta Detran: `https://servicos.detran.sc.gov.br/consulta-dossie-veiculo?placa=X&renavam=Y` — exige login no Detran Digital (conta do usuário). Seção "Recursos de infrações" lista recursos por código AIT (ex.: `N004330074`) em abas; resultado do processo na parte inferior do card. Aba "Débitos" contém a data limite associada ao mesmo código.

## Decisões tomadas (com o usuário)

1. **Escopo:** todas as AITs ativas (não encerradas), não só a fila de ≥10 dias.
2. **Fonte da verdade:** o site do Detran prevalece sobre o estado do workspace. A aba/instância onde o código aparece no site define qual campo atualizar.
3. **Código não encontrado no site:** manter como `Aguardando` (sem mudança de status).
4. **Data limite do próximo recurso:** extraída da aba "Débitos" do dossiê, localizando o mesmo código AIT.
5. **Execução:** atalho no desktop — duplo clique, usuário faz login no Detran quando pedido, automação percorre tudo e exibe relatório.
6. **Stack:** Node.js + Playwright (abordagem A; mesma linguagem do workspace).

## Arquitetura

Pasta `automacao/` no repo `zero-pontos`, executada localmente (clone em `C:\Users\eduar\dev\zero-pontos`):

```
automacao/
  index.js                 — orquestrador (CLI: --dry-run)
  supabase.js              — auth + leitura/gravação no Supabase
  detran.js                — Playwright: navegação e extração do dossiê
  mapeamento.js            — regras resultado→status (lógica pura, sem I/O)
  relatorio.js             — relatório HTML final
  captura.js               — Etapa 0: salva HTML real das páginas p/ fixtures
  .env                     — SUPABASE_URL/KEY + email/senha (gitignored)
  Consultar Recursos.bat   — atalho para desktop
  chrome-profile/          — perfil Chrome persistente (gitignored)
  fixtures/                — HTML capturado do site p/ testes
```

## Fluxo

1. Login no Supabase (credenciais do `.env`); carrega AITs com `encerrado = false` + placas + clientes.
2. Abre Chrome real (`channel: 'chrome'`, headed, perfil persistente). Navega para a consulta; se cair em tela de login, pausa e aguarda o usuário logar (detecção: página de consulta volta a responder). Sessões seguintes reutilizam o perfil.
3. Agrupa AITs por `placa_id` — uma consulta de dossiê por veículo.
4. Para cada placa: abre `consulta-dossie-veiculo?placa=&renavam=`.
   - Mensagem de erro de permissão (cliente não autorizou) → registra e pula; **não** atualiza `ultima_att`.
   - Percorre as abas de "Recursos de infrações" procurando cada código AIT; lê o resultado no card. A aba identifica a instância → campo alvo (`defesa_previa` / `jari` / `segunda_instancia`).
   - Se o resultado for Indeferido/Não conhecido, abre a aba "Débitos", localiza o mesmo código e extrai a data limite.
5. Mapeamento resultado site → workspace:

| Resultado no site | Status no workspace | Ação extra |
|---|---|---|
| Indeferido | `Indeferido` | grava data da aba Débitos em `vencimento` |
| Não conhecido | `Indeferido` | idem |
| Deferido | `Deferido` | se regra de encerramento do app se aplica (`deveEncerrar`), grava `encerrado = true` |
| Cadastrado sem decisão | `Aguardando` | — |
| Efeito Suspensivo | `Aguardando` | — |
| (código não encontrado) | mantém `Aguardando` | sem mudança de status |

6. Toda AIT consultada com sucesso (mesmo sem achar o código) recebe `ultima_att = hoje` → sai da fila por 10 dias. Placas com erro de permissão ou falha técnica não recebem `ultima_att`.
7. Relatório HTML ao final, aberto no browser: mudanças (antes → depois), datas gravadas, placas sem permissão, códigos não encontrados, falhas técnicas.

## Tratamento de erros

- Falha de navegação/timeout numa placa: 1 retry; persiste screenshot em `automacao/logs/` e segue para a próxima. Nenhuma falha interrompe a fila.
- Log de execução em arquivo (`automacao/logs/YYYY-MM-DD.log`).
- `--dry-run`: executa consulta e mapeamento completos, gera relatório, não grava nada no Supabase.
- Anti-automação do Detran (risco apontado pelo usuário): mitigações — Chrome real em vez de Chromium headless, perfil persistente com sessão legítima, execução headed, esperas por elemento (não fixas) + pequenos delays entre placas. Se ainda assim o site bloquear, degradar para modo assistido (script navega, usuário resolve captcha/bloqueio, script continua) antes de repensar a abordagem.

## Testes e validação

1. **Etapa 0 — captura (pré-requisito do parser):** `captura.js` abre o dossiê de 2–3 placas reais com o usuário logado e salva o HTML das seções "Recursos de infrações" (todas as abas), "Débitos" e da mensagem de erro de permissão em `fixtures/`. Também confirma a premissa de que as abas correspondem às instâncias (Defesa Prévia / JARI / 2ª Instância).
2. **Unit:** `mapeamento.js` e o parser de `detran.js` testados contra as fixtures (node:test).
3. **Validação de ponta a ponta:** 2–3 execuções em `--dry-run` comparadas com verificação manual do usuário. Só depois disso a gravação é ativada.

## Fora de escopo

- Rodar em servidor/nuvem ou agendamento automático.
- Protocolar recursos (fila de recursos) — apenas consulta/atualização de status.
- Outros estados além de SC.

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Site do Detran bloquear automação | Alto | Chrome real + perfil persistente + modo assistido; validar na Etapa 0 antes de construir o resto |
| Mudança de layout do site | Parser quebra | Fixtures versionadas facilitam ajuste; relatório acusa "não encontrado" em massa como sinal |
| Abas do site não corresponderem às instâncias | Mapeamento de campo errado | Confirmar na Etapa 0; se necessário, redesenhar a identificação da instância |
| Sessão Detran expirar no meio da execução | Fila para | Detectar redirecionamento a login em qualquer ponto e pausar aguardando o usuário |
