# Pacote para o Lovable

Os 34 arquivos desta pasta (`src/...`) vão para a raiz do projeto do Lovable,
mantendo os mesmos caminhos. Foram validados numa cópia do projeto exportado
(`mono-deploy-hub`): `tsc --noEmit` limpo e `vite build` ok.

## O que NÃO copiar do repositório
- `src/components/ui/*`, `src/integrations/supabase/client.ts`, `src/router.tsx`,
  `src/lib/utils.ts`: no repositório são versões do "build local" (usam os pacotes
  `cn` e `radix-ui`). O Lovable tem as dele; mantenha.
- `src/routes/api/public/backup*.ts`, `restaurar.ts`, `src/lib/backup.server.ts`:
  dependem do cron da Vercel, que foi removida.
- `supabase/migrations/*`: o banco já está atualizado (aplicado no SQL editor).
- `tests/*`: usam `bun:test`; o Lovable usa vitest.

## Particularidades deste pacote
- `src/integrations/supabase/types.ts`: é o arquivo GERADO do Lovable, só com as
  colunas novas acrescentadas (`profiles.tipo_acesso`, `senha_alterada_em`,
  `deve_trocar_senha` e `usuarios_autorizados.tipo_acesso`). Se o Lovable
  regenerar esse arquivo, as colunas passam a vir do banco.
- `src/routeTree.gen.ts`: gerado pelo build, já inclui `/mfa` e `/alterar-senha`.
  O Lovable também o regenera sozinho.

## Antes de publicar
1. Supabase: provedor de e-mail/senha ativo (Authentication > Providers > Email).
2. Supabase: MFA TOTP ativo (Authentication > Multi-Factor).
3. Variável `SUPABASE_SERVICE_ROLE_KEY` configurada como secret do projeto.
