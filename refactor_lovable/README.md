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
| 3. Integrações (Checklist Fácil + parecer Claude) | ⏳ |
| 4. RAG das normas | ⏳ |
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
