# refactor_lovable

Código da refatoração do sistema de auditoria para a stack Lovable, seguindo
[ESPEC_REFATORACAO_LOVABLE.md](../ESPEC_REFATORACAO_LOVABLE.md). A estrutura
desta pasta espelha a raiz do projeto no Lovable: o conteúdo de `supabase/` e
`src/` vai para as pastas de mesmo nome lá.

## Andamento

| Parte | Status |
|---|---|
| 1. Banco (migrations) | ✅ pronta |
| 2. Login (Microsoft Entra ID) | ⏳ |
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
- **Mantido igual ao Python, mas vale revisar:** reprocessar uma auditoria
  acrescenta um novo lote de sugestões sem apagar o anterior, o que pode
  duplicar contagens no score.

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
