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
| 3b. Integração Checklist Fácil (+ server function de revisão) | ⏳ aguardando definição da API |
| 5. Telas | ⏳ |
| 6. Exportação Excel | ⏳ |

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
