# refactor_lovable

Código da refatoração do sistema de auditoria para a stack Lovable, seguindo
[ESPEC_REFATORACAO_LOVABLE.md](../ESPEC_REFATORACAO_LOVABLE.md). A estrutura
desta pasta espelha a raiz do projeto no Lovable: o conteúdo de `supabase/` e
`src/` vai para as pastas de mesmo nome lá.

## Andamento

| Parte | Status |
|---|---|
| 1. Banco (migrations) | ✅ pronta |
| 2. Login (Microsoft Entra ID) | ✅ pronta |
| 3a. Parecer com Claude + RAG das normas | ✅ pronta |
| 3b. Integração Checklist Fácil | ✅ pronta (falta validar com o token real) |
| 5. Telas | ✅ pronta |
| 6. Exportação Excel | ✅ pronta |

## Parte 1 — Banco

Migrations em `supabase/migrations/`, aplicar em ordem:

| Arquivo | Conteúdo |
|---|---|
| `…120000_perfis_e_papeis.sql` | `app_role`, `profiles`, `user_roles`, `usuarios_autorizados`, `has_role()`, `is_analista()`, triggers de cadastro/login, trava do último analista, seed dos analistas |
| `…120100_auditorias.sql` | `auditorias`, `reprocessamentos`, `sugestoes`, `registrar_auditoria()` |
| `…120200_config_itens_e_uso_tokens.sql` | `config_itens`, `uso_tokens` |
| `…120300_relatorios.sql` | `score_auditores()`, `resumo_uso_tokens()`, `uso_tokens_por_dia()`, `listar_inativos()` |
| `…130000_sugestoes_versionadas.sql` | Sugestões substituídas a cada reprocessamento, com histórico preservado |

### De `src/database.py` para o banco novo

| Python (SQLite) | Postgres |
|---|---|
| `usuarios` | `profiles` + `user_roles` + `usuarios_autorizados` |
| `sessoes`, `recuperacao_senha`, `hash_senha`, `verificar_senha`, `alterar_senha`, `validar_forca_senha`, `dias_ate_expirar_senha` | Removidos: Auth do Lovable Cloud (SSO) |
| `_seed_admin` (admin/admin123) | Seed em `usuarios_autorizados` (sem senha) |
| `criar_usuario` | `insert` em `usuarios_autorizados` |
| `atualizar_usuario` (ativo) | `update profiles set ativo` |
| `alterar_perfil` | `update usuarios_autorizados set perfil` (trigger sincroniza `user_roles`) |
| `excluir_usuario` | `delete` em `usuarios_autorizados` (desativa o perfil) |
| Checagens "único analista ativo" | Triggers `garantir_analista_ao_*` |
| `require_analista` | `is_analista(auth.uid())` nas policies |
| `registrar_auditoria_v2` + `registrar_sugestoes` | `rpc('registrar_auditoria')` (service_role) |
| `registrar_feedback_sugestao` | `update sugestoes set aceita` (RLS + trigger preenche `aceita_em`/`aceita_por`) |
| `historico_auditorias`, `historico_reprocessamentos` | `select` direto nas tabelas (RLS) |
| `upsert_config_item`, `listar_config_itens` | `upsert` com `onConflict: 'checklist_id,item_nome'` |
| `registrar_uso_tokens` | `insert` em `uso_tokens` (service_role) |
| `score_auditores`, `resumo_uso_tokens`, `uso_tokens_por_dia`, `listar_inativos` | `rpc(...)` das funções de mesmo nome |

### Decisões e mudanças de comportamento

- **Acesso só para pré-cadastrados.** Com SSO qualquer conta Microsoft do
  tenant autentica; quem não está em `usuarios_autorizados` entra inativo e
  sem papel, sem ver nada.
- **Escrita de auditorias só no servidor.** `auditorias`, `reprocessamentos`
  e `uso_tokens` não têm policy de escrita: a server function grava com
  service_role. Assim um auditor não consegue forjar resultado de revisão.
- **Sugestões: só o feedback é editável** (grant de coluna em `aceita`).
- **Score de auditores corrigido.** No Python, o JOIN com `sugestoes`
  multiplicava `total_nc` e distorcia a média; agora as sugestões são
  agregadas por auditoria antes.
- **Uso de tokens por dia** agrupa pelo dia de Brasília (antes, UTC).
- **Reprocessar substitui as sugestões.** No Python, cada reprocessamento
  acrescentava um lote novo e inflava o score. Agora o lote novo é o vigente
  (`substituida_em is null`) e o anterior fica como histórico, ligado ao
  snapshot em `reprocessamentos` via `reprocessamento_id`. O score e o
  feedback consideram só as vigentes; no app, filtrar
  `.is('substituida_em', null)` para listar as atuais.

### Fora desta parte

- Busca nas normas (`normas_chunks`) entra na Parte 4.
- Migração dos dados históricos do `data/bernhoeft.db`: os ids de usuário
  mudam (inteiro → uuid), então precisa de um script próprio, se for desejado.
- Exclusão definitiva da conta (`auth.users`) só pela API admin, no servidor.

### Validação

A sintaxe das migrations (incluindo os corpos plpgsql) foi validada com o
parser do Postgres (`pglast`). Ainda não foram executadas num banco real:
validar ao aplicar no Lovable Cloud.

Secrets novos nesta parte: nenhum.

## Parte 2 — Login (Microsoft Entra ID)

Login, sessão e senha saem do app: quem autentica é a Microsoft, via Auth do
Lovable Cloud. O controle de quem pode usar o sistema continua no banco
(`usuarios_autorizados`, Parte 1).

| Arquivo | Papel |
|---|---|
| `src/lib/auth-middleware.ts` | Middleware das server functions: envia o token no cliente, valida no servidor e entrega um client do banco que age como o usuário (RLS) |
| `src/lib/auth.server.ts` | `getUsuarioAtual()`: perfil + papel |
| `src/lib/auth.functions.ts` | `getMe` (server function) e `meQueryOptions` |
| `src/lib/auth-client.ts` | `entrarComMicrosoft()`, `sair()`, `obterSessao()`, `destinoSeguro()` |
| `src/routes/auth.tsx` | Tela de login (`/auth`) |
| `src/routes/_authenticated/route.tsx` | Layout protegido: exige sessão e usuário autorizado; entrega `context.me` |
| `src/routes/_authenticated/analista/route.tsx` | Área `/analista`: exige papel analista |
| `src/routes/acesso-pendente.tsx` | Logou com a Microsoft, mas não foi autorizado por um analista |
| `src/components/botao-sair.tsx` | Botão de logout |
| `src/components/auth-listener.tsx` | Reage a logout em outra aba ou sessão expirada; montar no `__root.tsx` |

### De `review_api.py` para o novo login

| Python | Destino |
|---|---|
| `GET /login` | `/auth` |
| `POST /api/login` | `entrarComMicrosoft()` |
| `POST /api/logout` | `BotaoSair` / `sair()` |
| `GET /api/me` | `getMe` |
| `require_auth` | Layout `_authenticated` (navegação) + `authMiddleware` (server functions) |
| `require_analista` | Layout `_authenticated/analista` (navegação) + RLS `is_analista()` (dados) |
| `POST /api/alterar-senha`, expiração de 90 dias, política de senha, recuperação de senha | Removidos: regras da conta Microsoft |

### Configuração manual (uma vez)

1. **Azure Portal → Microsoft Entra ID → App registrations → New registration**
   - Contas: *somente este diretório organizacional* (só a Bernhoeft).
   - Redirect URI (Web): a URL de callback mostrada no provedor Azure do
     Lovable Cloud (termina em `/auth/v1/callback`).
   - Criar um *client secret* e anotar o *Application (client) ID* e o
     *Directory (tenant) ID*.
2. **Lovable Cloud → Auth → Providers → Azure (Microsoft)**: ativar e
   preencher client ID, secret e a URL do tenant
   (`https://login.microsoftonline.com/<tenant-id>`).
3. **Desativar** os provedores e-mail/senha, telefone, Google e Apple.
4. **URLs de redirecionamento permitidas**: incluir `<url-do-app>/auth`
   (preview e produção).

### Secrets e dependências

- Secrets: `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`, que o Lovable Cloud
  já cria ao ser ativado. Nenhum secret novo.
- Dependências: `@supabase/supabase-js`, `zod`, `lucide-react`,
  `@tanstack/react-query` (todas JS puras, compatíveis com o runtime edge).
- Usa os arquivos gerados pelo Lovable `@/integrations/supabase/client` e
  `@/integrations/supabase/types` (não escritos aqui, conforme a especificação).

### Pendências desta parte

- Montar `<AuthListener />` no `__root.tsx` e criar as páginas `/` e
  `/analista`: entram na Parte 5 (telas).
- O código ainda não foi compilado: não há Node/bun nesta máquina. Validar
  com o build do Lovable ao importar.

## Parte 3a — Parecer com Claude + RAG das normas

| Arquivo | Papel |
|---|---|
| `supabase/migrations/…140000_normas_rag.sql` | `normas_chunks` (full-text em português), `buscar_normas()`, `listar_normas()`, bucket privado `normas` |
| `src/lib/normas.server.ts` | Extração de PDF (`unpdf`), chunking, indexação, remoção e busca |
| `src/lib/normas.functions.ts` | Server functions do analista: `listarNormas`, `indexarNorma`, `removerNorma` |
| `src/lib/claude.server.ts` | Config, chamada ao Claude, custo por modelo, registro em `uso_tokens`, paralelismo limitado |
| `src/lib/parecer.server.ts` | `gerarParecer()`: pareceres por item + parecer geral |
| `src/lib/supabase-admin.server.ts` | Client service_role (só servidor) |

### Do Python para o novo código

| Python | Destino |
|---|---|
| `rag_service.py` (ChromaDB + TF-IDF/SVD) | Full-text search do Postgres (`buscar_normas`) |
| `pdf_extractor.py` (pdfplumber/pypdf) | `unpdf` (JS puro, roda no runtime edge) |
| `index_norms.py` (script local) | Upload no bucket `normas` + server function `indexarNorma` |
| `get_collection_stats`, `delete_source` | `listarNormas`, `removerNorma` |
| `gerar_parecer` | `gerarParecer` |
| `_extrair_recomendacao`, `_extrair_constatacao`, `_extrair_texto_campo` | Removidos: structured outputs entregam cada seção num campo |
| `registrar_uso_tokens` | `registrarUso` |

### Decisões e mudanças de comportamento

- **Busca nas normas por full-text em português.** O Python usava TF-IDF
  por padrão, que também é lexical; os termos do item são combinados com OU
  e ordenados por relevância. Sem embeddings, sem secret novo.
- **Respostas em JSON (structured outputs).** O Claude devolve
  `constatacao`, `fundamentacao`, `recomendacao`, `texto_campo`,
  `criticidade` e `justificativa_criticidade`, validados por schema. Acaba a
  extração por texto, que falhava quando o modelo variava a formatação.
- **Modelo padrão `claude-opus-5-5`** (antes `claude-sonnet-4-6`),
  configurável por `MODELO_CLAUDE`. Esforço `medium` por padrão
  (`PARECER_ESFORCO`).
- **Fallback em recusa:** nos modelos que aceitam, uma recusa do modelo é
  refeita automaticamente pela Anthropic em outro modelo
  (`fallbacks: "default"`).
- **Pareceres em paralelo** (até `PARECER_CONCORRENCIA`, padrão 4); no
  Python eram em sequência. Falha num item não derruba os outros: o item
  volta com `erro` preenchido.
- **Custo** calculado pelo modelo que de fato respondeu, incluindo cache.
- **Itens só com erro de digitação** são enviados ao modelo como "Conforme
  (revisão do texto registrado)"; no Python saíam como "Parcialmente Conforme".
- `MAX_TOKENS_PARECER` saiu: 600 tokens cortariam a resposta, já que o
  raciocínio do modelo conta nesse limite.
- O system prompt é curto demais para o cache de prompt valer (há um
  tamanho mínimo); o marcador de cache fica para quando ele crescer.

### Secrets e dependências

- Secrets obrigatórios: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Opcionais (têm padrão): `MODELO_CLAUDE`, `PARECER_ESFORCO`,
  `PARECER_MOCK`, `PARECER_CONCORRENCIA`, `RAG_TOP_K`.
- Dependências: `@anthropic-ai/sdk`, `unpdf`.

### Pendências desta parte

- `gerarParecer` ainda não tem server function própria: ela entra na Parte
  3b, junto com a busca da auditoria no Checklist Fácil.
- `registrar_auditoria()` calcula `tipo` sem considerar erro de digitação,
  enquanto `obrigatorio` considera (divergência herdada do Python). Alinhar
  na Parte 3b.
- Indexar as 55 normas da pasta `norms/`: upload no bucket e chamada de
  `indexarNorma` (a tela entra na Parte 5). PDFs grandes (~3 MB) podem
  esbarrar no limite de CPU do runtime edge: validar na prática.
- PDFs escaneados (imagem) não têm texto extraível; a indexação avisa.
- Código ainda não compilado: validar com o build do Lovable.

## Parte 5 — Telas

| Arquivo | Papel |
|---|---|
| `src/styles.css` | Tokens de design: paleta das páginas originais em oklch + tokens de status (`success`, `warning`, `destructive-soft`, `info`…) |
| `src/routes/__root.tsx` | Shell HTML, fonte Inter, `AuthListener`, `Toaster` |
| `src/components/ui/button.tsx`, `badge.tsx` | shadcn com variantes do sistema (`success`, `warning`, `header`; badges de status) |
| `src/components/app-header.tsx`, `estado.tsx`, `score-badge.tsx` | Cabeçalho azul, estados de carregando/vazio, badge de score |
| `src/routes/_authenticated/index.tsx` | Revisão (`/`, substitui `static/index.html`) |
| `src/components/revisao/*` | Resultado por categoria, filtros, card do item, feedback |
| `src/lib/revisao.server.ts`, `revisao.functions.ts` | `revisarAuditoria` (busca → parecer → `registrar_auditoria`) e `registrarFeedback` |
| `src/lib/checklist-facil.server.ts` | Ponto único da busca no Checklist Fácil: **pendente (Parte 3b)** |
| `src/routes/_authenticated/analista/index.tsx` | Painel do Analista (`/analista`, substitui `static/analista.html`) |
| `src/components/analista/*` | Abas Auditorias, Indicadores, Usuários, Configurações (regras + normas) e Tokens |
| `src/lib/analista.server.ts`, `analista.functions.ts` | Dados do painel; `analistaMiddleware` exige analista |

### De `static/*.html` e `review_api.py` para as telas

| Antes | Agora |
|---|---|
| `static/login.html` | `/auth` (Parte 2) |
| `static/index.html` | `/` |
| `static/analista.html` | `/analista` (aba atual na URL: `?aba=usuarios`) |
| `POST /api/revisar`, `POST /api/feedback` | `revisarAuditoria`, `registrarFeedback` |
| `GET /api/auditorias`, `/api/historico`, `/api/reprocessamentos/{id}` | `listarAuditorias`, `historicoReprocessamentos` |
| `GET /api/score-auditores`, `/api/uso-tokens` | `scoreAuditores`, `usoTokens` |
| `/api/usuarios*` | `listarUsuarios`, `autorizarUsuario`, `definirAtivo`, `removerAutorizacao`, `listarInativos` |
| `/api/config-itens` | `listarConfigItens`, `salvarConfigItem` |

### Mudanças de comportamento

- **Feedback nas sugestões:** cada sugestão tem "Aceitar / Ignorar", que
  alimenta as colunas de aceitação da aba Indicadores (no HTML atual não
  havia botão, então essas métricas ficavam zeradas).
- **Fundamentação normativa** aparece no card do item (o campo vem separado
  do parecer agora).
- **Usuários:** "Novo usuário com senha" virou "Autorizar usuário" (e-mail
  Microsoft + perfil). Status novos: "Aguardando 1º acesso" e
  "Não autorizado". "Excluir" virou "Remover acesso".
- **Normas:** a aba Configurações ganhou envio de PDFs, indexação e remoção
  (antes era o script `index_norms.py`).
- A aba aberta fica na URL, então recarregar a página mantém a aba.

### Ao importar no Lovable

- **Apagar `src/routes/index.tsx` do template**: a rota `/` agora é
  `src/routes/_authenticated/index.tsx` e as duas conflitam.
- `__root.tsx`, `styles.css`, `button.tsx` e `badge.tsx` substituem os do
  template; mesclar se o template tiver algo a mais.
- Componentes shadcn usados (além de button/badge): `card`, `input`,
  `label`, `dialog`, `alert-dialog`, `tabs`, `sonner`.
- Dependências: `react-hook-form`, `@hookform/resolvers`, `tw-animate-css`.

### Pendências desta parte

- **Parte 3b:** busca no Checklist Fácil (hoje a revisão para com uma
  mensagem clara), botão "Processar pendentes" (lote), aplicação das regras
  de itens na revisão (desabilitar item, tipo obrigatório/sugestão,
  "exige imagem" sem anexo) e alinhamento de `tipo` × `obrigatorio`.
- **Parte 6:** botão "Exportar Excel" na aba Auditorias.
- Revisões longas (muitos itens) podem esbarrar no tempo máximo de uma
  requisição no runtime edge: validar na prática.
- Nomes de PDF com acentos podem ser recusados pelo Storage; renomear antes
  do envio se acontecer.
- Código ainda não compilado: validar com o build do Lovable.

## Parte 6 — Exportação Excel

| Arquivo | Papel |
|---|---|
| `supabase/migrations/…20261005120000_auditorias_payload.sql` | Coluna `auditorias.payload` (revisão completa) e `registrar_auditoria` com `p_payload` |
| `src/lib/revisao.server.ts` | Monta e grava o `PayloadRevisao` a cada revisão |
| `src/lib/analista.server.ts` / `.functions.ts` | `exportacaoAuditorias`: payloads das auditorias pedidas (analista) |
| `src/lib/exportar-excel.ts` | Gera e baixa a planilha no navegador (`exceljs`) |
| `src/components/analista/aba-auditorias.tsx` | Botão "Exportar Excel" |

### Do Python para o novo código

| Python | Destino |
|---|---|
| `export_excel.py` (script de terminal) | Botão "Exportar Excel" no painel |
| `load_payloads_from_output` (JSONs de `output/`) | `exportacaoAuditorias` (coluna `auditorias.payload`) |
| `generate_excel` + `build_resumo` / `build_nao_conformidades` / `build_auditoria` | `exportarExcel` com as mesmas 3 abas |
| `_extrair_secao(parecer, "Criticidade")` | Campo `criticidade` do parecer estruturado |

### Decisões e mudanças de comportamento

- **Exporta o que está listado na tabela** (mesmos filtros da aba
  Auditorias), em vez de tudo que estava em `output/`.
- **Gerada no navegador:** `exceljs` depende de APIs do Node que o runtime
  edge não tem.
- **Parecer na planilha** junta as seções (constatação, fundamentação,
  recomendação, texto do campo); a criticidade vem com a justificativa.
- **Link na aba Resumo** para a aba de cada auditoria.
- `sugestoes.tipo` agora segue o `obrigatorio` calculado no parecer
  (resolve a pendência da Parte 3a).

### Secrets e dependências

- Sem secrets novos. Dependência: `exceljs` (carregada só ao exportar).

### Pendências desta parte

- Auditorias processadas antes desta versão não têm payload e ficam de fora
  da planilha (o painel avisa); basta revisá-las de novo.
- Código ainda não compilado: validar com o build do Lovable.

## Build local (fora do Lovable)

O projeto compila e roda localmente com o bun. Os arquivos que o template
do Lovable traria (`package.json`, `vite.config.ts`, `tsconfig.json`,
`router.tsx`, componentes shadcn, client e tipos do Supabase) estão nesta
pasta.

```bash
bun install
bun run typecheck   # tsc --noEmit, modo strict da especificação
bun run build       # vite build (cliente + servidor)
bun run dev         # http://localhost:3000
```

- `src/integrations/supabase/types.ts` foi escrito a partir das migrations.
  No Lovable Cloud (ou com `supabase gen types`) ele é gerado do banco real;
  substitua quando houver um banco.
- Sem `.env`, o app abre e a tela de login renderiza, mas login e dados
  exigem um projeto Supabase. Copie `.env.example` para `.env` e preencha.
- Versões fixadas: Vite 7 (especificação) e `@vitejs/plugin-react` 5 (a 6
  exige Vite 8).
- O TanStack Start atual marca `inputValidator()` como obsoleto em favor de
  `validator()`. Mantido `inputValidator`, que é o padrão da especificação e
  do template do Lovable; trocar se o template já usar `validator`.

### Verificado em 2026-10-05

- `bun run typecheck` e `bun run build` sem erros.
- `bun run dev`: `/` e `/analista` sem sessão redirecionam para `/auth`
  guardando o destino; a tela de login renderiza com os tokens de design; uma
  rota inexistente mostra "Página não encontrada".
- Não testado (precisa de Supabase + Entra ID): login, painel com dados,
  revisão com IA, upload de normas e exportação Excel.

## Deploy na Vercel + Supabase

O app roda na Vercel; o banco, o login e os arquivos ficam num projeto
Supabase (a Vercel não hospeda nada disso). O `nitro` no `vite.config.ts` gera
a saída da Vercel (`.vercel/output`) sozinho quando o build roda lá.

1. **Supabase:** criar o projeto e aplicar as migrations em ordem
   (`npx supabase link --project-ref <ref>` e `npx supabase db push`, ou colar
   cada arquivo no SQL Editor).
2. **Login Microsoft:** seguir a "Configuração manual" da Parte 2, usando o
   painel do Supabase (Authentication → Providers → Azure). Em
   Authentication → URL Configuration, usar a URL da Vercel como Site URL e
   incluir `https://<app>.vercel.app/auth` nas Redirect URLs.
3. **Vercel:** importar o repositório com **Root Directory =
   `refactor_lovable`** (o restante é detectado: bun pelo `bun.lock`, build
   `vite build`). Cadastrar as variáveis do `.env.example` em Settings →
   Environment Variables.
4. **Cron de backup:** o `vercel.json` chama `/api/public/backup` todo dia às
   06:00 UTC (03:00 de Brasília). A Vercel envia o `CRON_SECRET` sozinha.

Notas:
- O `nitro` (beta, versão fixada) avisa que prefere Vite 8; o build com Vite 7
  (exigido pela especificação) funciona. Ao importar no Lovable, o plugin
  `nitro()` pode sair do `vite.config.ts`: o template cuida da hospedagem.

## Backup e restauração

Migration `…130000_backup_restauracao.sql` + `src/lib/backup.server.ts` +
rotas em `src/routes/api/public/`. O backup é um JSON compactado (gzip) no
bucket privado `backups`, com todas as tabelas de `public` e os usuários
(`auth.users` / `auth.identities`). Os ids dos usuários são mantidos, então o
login Microsoft continua ligado ao histórico depois de restaurar.

| Rota | Token | Faz |
|---|---|---|
| `GET/POST /api/public/backup` | `CRON_SECRET` | Gera um backup (o cron diário usa esta). Mantém os `BACKUP_RETENCAO` mais recentes (padrão 30) |
| `GET /api/public/backups` | `CRON_SECRET` | Lista os backups |
| `GET /api/public/backups?arquivo=<nome>` | `CRON_SECRET` | Link de download (10 min) |
| `POST /api/public/restaurar` | `RESTORE_TOKEN` | **Substitui** todos os dados pelo backup. Desligada enquanto `RESTORE_TOKEN` não existir |

```bash
# backup manual
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/public/backup

# restaurar um backup do próprio projeto
curl -X POST https://<app>/api/public/restaurar \
  -H "Authorization: Bearer $RESTORE_TOKEN" -H "Content-Type: application/json" \
  -d '{"arquivo": "backup-2026-10-05T06-00-00-000Z.json.gz", "confirmar": "RESTAURAR"}'
```

Garantias da restauração:
- Roda numa transação só: se der erro, nada muda.
- Antes de restaurar, salva o estado atual como `pre-restauracao-*.json.gz`
  (fora da retenção), para desfazer.
- Usuários nunca são apagados, só acrescentados. Se um e-mail do backup já
  existir com outro id (alguém logou no projeto novo antes da restauração), a
  restauração é recusada e lista os e-mails, que devem ser removidos em
  Authentication → Users.
- Colunas novas recebem o default; colunas que deixaram de existir são
  ignoradas. Tabela nova precisa entrar em `_ordem` da função
  `backup_restaurar` se tiver chave estrangeira para outra.

**Não entra no backup:** os PDFs do bucket `normas`. O texto indexado
(`normas_chunks`) entra, então a busca funciona logo depois. Para ter os PDFs
no projeto novo, reenvie-os pela aba Configurações.

### Migrar para a Lovable (ou outro projeto Supabase)

1. No projeto novo, aplicar as migrations (no Lovable Cloud elas entram com o
   código) e configurar o `RESTORE_TOKEN`.
2. **Antes de qualquer pessoa logar no projeto novo**, gerar o link do último
   backup no projeto antigo (`/api/public/backups?arquivo=…`) e restaurar no
   novo com `{"url": "<link>", "confirmar": "RESTAURAR"}`.
3. Depois de migrar, apagar o `RESTORE_TOKEN` para fechar a rota de novo.

O backup fica no mesmo projeto Supabase: se o projeto for apagado, os backups
vão junto. Baixe um de tempos em tempos para fora dele.

### Verificado em 2026-10-05 (Supabase local, Docker)

- As 8 migrations aplicam sem erro num banco real (as 7 anteriores nunca
  tinham sido executadas).
- Backup → dados alterados/apagados → restauração: contagens iguais às
  originais em todas as tabelas, triggers religados, ids novos continuam
  depois do maior restaurado, busca nas normas funcionando.
- Migração para um projeto vazio: todos os dados e usuários voltam com os
  mesmos ids e o Auth reconhece os usuários restaurados.
- Conflito de e-mail: restauração recusada, nada alterado.
- Rotas sem token, ou com o token errado, respondem 401.
- `bun run typecheck` e o build com o preset da Vercel sem erros.

## Modo demonstração (SQLite local)

Para apresentar o sistema sem Supabase, sem login Microsoft e sem o
Checklist Fácil. **Só para uso local**: o modo se recusa a ligar na Vercel.

```bash
bun install
bun run demo:normas   # opcional: indexa os PDFs de ../norms no SQLite (~15 s)
bun run demo          # http://localhost:3000
```

- **Banco:** SQLite em `.demo/auditoria.sqlite` (fora do git), criado na
  primeira execução com o schema das migrations, os triggers de pré-cadastro e
  a trava do último analista. `bun run demo:reset` apaga e recomeça do zero.
- **Login:** a tela `/auth` lista usuários fictícios (Ana Analista, Bruno
  Auditor, Carla Souza). Diego Externo aparece como "Não autorizado" no painel.
- **Auditorias:** #900000001, #900000002 e #900000003 são fictícias e fazem
  o papel do Checklist Fácil.
- **IA:** sem `ANTHROPIC_API_KEY` os pareceres são simulados (marcados
  `[SIMULADO]`). Para usar o Claude de verdade, defina a chave no terminal
  antes de `bun run demo`; ela não deve ser gravada em `.env.demo`.
- **Normas:** a busca usa FTS5 (sem os radicais do português do Postgres,
  então os resultados podem diferir um pouco). O envio de PDF pelo navegador
  fica desativado; use `bun run demo:normas`.
- **Sem RLS:** o banco é local e de demonstração; o acesso ao painel continua
  barrado para quem não é analista.

### Como funciona

Nada nas telas nem nas server functions muda. Com `MODO_DEMO=true`:
`authMiddleware` aceita a sessão fictícia e entrega um client SQLite
(`src/lib/demo/cliente-demo.server.ts`) que imita o pedaço do client do
Supabase usado pelo app; `criarClienteAdmin` usa o mesmo banco; e
`buscarAuditoriaEstruturada` devolve as auditorias de exemplo.

### Verificado em 2026-10-05

- Login como Ana Analista → revisão da #900000001 (score 50% ponderado, 3 NC, 3
  parciais, 4 conformes) → feedback "Aceitar" gravado.
- Painel: auditoria listada, KPIs e score por auditor/checklist, Indicadores
  com 1 sugestão aceita de 10, Usuários com os 4 status, trava do último
  analista bloqueando a desativação da Ana.
- 55 normas indexadas (2.899 trechos); na revisão seguinte o item do
  capacete recuperou a NR-06 e o do cinto, a NR-35. Reprocessamento contado.
- Planilha gerada a partir do payload salvo, com as 3 abas (testada por
  script, sem download no navegador).

## Parte 3b — Integração com o Checklist Fácil

| Arquivo | Papel |
|---|---|
| `src/lib/checklist-facil.server.ts` | Busca `v2/evaluations/{id}` na API de Integração e estrutura categorias → itens → resposta/comentário |

### Do Python para o novo código

| Python | Destino |
|---|---|
| `api/client.py` (`get`, headers, URLs do `.env`) | `fetch` com Bearer e timeout de 30 s |
| `polling_service.fetch_and_structure` | `buscarAuditoriaEstruturada` (mensagens de erro amigáveis) |
| `enrichment_service.extract_audit_payload` | `estruturarAvaliacao` |

As regras de conformidade (notas 1-6, palavras-chave de texto livre), os
pesos (Mandatório 3, Importantes 2, Desejáveis 1), o score ponderado e os
níveis (90/75/60) são as mesmas. Conferido item a item contra o código
Python com os mesmos dados: resultado idêntico (exceto a correção das palavras curtas, abaixo).

### Secrets

- `CHECKLIST_FACIL_API_TOKEN`
- `CHECKLIST_FACIL_INTEGRATION_URL` (`https://integration.checklistfacil.com.br`)

### Diferenças em relação ao Python

- Um 404 da API agora diz "avaliação não encontrada". No Python virava
  `{"data": []}` e a mensagem acabava sendo "não possui itens respondidos".
- Sem os secrets, a mensagem diz quais definir.

### Pendências e pontos de atenção

- **Validar com o token real.** Em agosto, `v2/evaluations` na API de
  Integração respondia 404 para todas as avaliações (a listagem da API de
  Analytics funcionava). Se isso persistir, a revisão mostra "não
  encontrada"; nesse caso é preciso confirmar com a Checklist Fácil qual
  endpoint devolve o detalhe e o formato do JSON.
- **Corrigido em relação ao Python:** em respostas de texto livre sem nota, as palavras curtas (`nc`, `ok`, `sim`) agora valem só como palavra inteira. No Python eram busca de trecho, e `nc` marcava como não conforme qualquer texto que contivesse essas letras (ex.: `Financeiro`, `concluído`). As palavras longas seguem como no Python.
- Fora desta parte: botão "Processar pendentes" (lote, usa a API de
  Analytics) e aplicação das regras de `config_itens` na revisão (o Python
  também não as aplicava na revisão).

## Correções da revisão de código (2026-10)

Pontos apontados numa revisão externa e corrigidos aqui:

- **Erro de digitação** (`temErroOrtografico`): "instrução", "construção", "obstruída", "transporte" e afins não são mais marcados; siglas em maiúsculas (PCMSO, SESMT) também não.
- **Texto livre sem nota:** negações ("não existe", "não apresentado", "sem ... adequado") e antônimos ("inadequado") viram não conforme em vez de conforme. Palavras de conformidade só valem no começo da palavra.
- **Titularidade:** só quem revisou uma auditoria, ou um analista, pode reprocessá-la; antes, qualquer usuário ativo a "roubava". A checagem vem antes das chamadas pagas ao Claude.
- **Chave da Anthropic:** sem `ANTHROPIC_API_KEY` a revisão falha com mensagem clara (só `PARECER_MOCK=true` ou a demonstração local simulam).
- **Painel:** o limite de 500 vale depois dos filtros (status e datas vão para o banco); "Todos" inclui todos os status.
- **Custo:** preços de Fable e demais modelos de fallback, e desconto de leitura de cache por modelo.
- **Score:** código de resposta desconhecido não conta mais como zero ponto; a criticidade tem uma implementação só (`src/lib/criticidade.ts`).
- **Testes:** `bun run test` cobre ortografia, negações e score (`tests/`).

Ainda em aberto: limite de uso por usuário/auditoria (cada clique gera chamadas pagas), revisão em segundo plano com fila (hoje roda numa só requisição), vínculo entre o auditor do Checklist Fácil e o usuário, e `user_roles` não ser limpo ao remover o acesso.