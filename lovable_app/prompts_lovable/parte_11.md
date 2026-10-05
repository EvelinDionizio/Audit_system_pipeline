Parte 11 de 11 — finalização. Todos os arquivos foram enviados.

1. Adicione a dependência `exceljs`.
2. Configure as 4 edge functions — `revisar`, `listar-pendentes`, `admin-usuarios`, `alterar-senha` — com `verify_jwt = false` no `supabase/config.toml` (mantenha o `project_id` existente; a autenticação é validada dentro de cada função em `_shared/auth.ts`) e publique-as junto com a pasta `supabase/functions/_shared/`.
3. Solicite que eu cadastre estes secrets pelo formulário de secrets (não peça os valores no chat): `CHECKLIST_FACIL_API_TOKEN`, `CHECKLIST_FACIL_BASE_URL`, `CHECKLIST_FACIL_INTEGRATION_URL`, `ANTHROPIC_API_KEY`. Os demais (`MODELO_CLAUDE`, `MAX_TOKENS_PARECER`, `MAX_TOKENS_PARECER_GERAL`, `PARECER_MOCK`, `PARECER_CONCORRENCIA`, `API_MAX_TENTATIVAS`, `RAG_TOP_K`) têm padrão no código — não os crie.
4. Os componentes shadcn usados são `button`, `input`, `label`, `dialog`, `alert-dialog`, `sonner`; se algum não existir em `src/components/ui/`, adicione o padrão do shadcn.
5. Confira se `src/main.tsx` renderiza `App` de `./App` e importa `./index.css`.
6. Rode o build e corrija APENAS erros de TypeScript/compilação, com a menor alteração possível e sem mudar comportamento.
7. NÃO ative o Lovable AI nem qualquer integração de IA.

Ao terminar, me responda com: o que foi feito em cada item; cada arquivo que você alterou e o motivo; e as configurações de autenticação que preciso ajustar manualmente (desativar sign-up; senha com mínimo de 8 caracteres, maiúsculas, minúsculas e dígitos).
Rotas para teste: `/login`, `/` (revisão do auditor), `/analista` (somente perfil analista).
