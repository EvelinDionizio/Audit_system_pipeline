# Especificação de destino: refatorar app Python monolito → stack Lovable

## Stack obrigatória (não negociável)

- Framework: TanStack Start v1 (React 19, SSR, full-stack) + Vite 7
- Linguagem: TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Estilo: Tailwind CSS v4 (configurado via `src/styles.css`, sem `tailwind.config.js`), componentes shadcn/ui (estilo new-york, ícones lucide)
- Dados no cliente: TanStack Query
- Validação: zod
- Gerenciador de pacotes: bun
- Runtime do servidor: edge serverless (estilo Cloudflare Workers). NÃO é um processo Node completo.
- PROIBIDO: Python, Next.js, react-router-dom, Express, Vue/Angular, `src/pages`, `App.tsx` com roteador próprio.

## Estrutura de pastas

```
src/
  routes/                     # roteamento baseado em arquivos (TanStack Router)
    __root.tsx                # shell HTML + layout global (renderiza <Outlet />)
    index.tsx                 # rota "/"
    sobre.tsx                 # rota "/sobre"
    clientes/index.tsx        # rota "/clientes"
    clientes/$id.tsx          # rota "/clientes/:id"  (parâmetro = $id)
    _authenticated/route.tsx  # layout protegido (exige login, redireciona para /auth)
    _authenticated/painel.tsx # rota "/painel" protegida
    api/public/*.ts           # endpoints HTTP crus (webhooks, cron, API pública)
  components/                 # componentes React
  components/ui/              # shadcn
  lib/                        # utilitários + *.functions.ts (server functions)
  hooks/
  styles.css                  # design tokens (cores em oklch, variáveis semânticas)
  router.tsx, start.ts, server.ts  # já existem, manter
```

- `src/routeTree.gen.ts` é gerado automaticamente. Nunca editar.
- Import alias: `@/` → `src/`

## Mapeamento Python → destino

| Python (Flask/Django/FastAPI)          | Destino                                                       |
|----------------------------------------|---------------------------------------------------------------|
| Views / templates (Jinja, Django tmpl) | Componentes React em `src/routes/*.tsx`                       |
| Rotas/URLs                             | Arquivos em `src/routes/`                                     |
| Lógica de negócio / services           | `src/lib/*.server.ts` (só servidor)                           |
| Endpoints chamados pelo próprio front  | `createServerFn` em `src/lib/*.functions.ts` (RPC tipado)     |
| Endpoints chamados por terceiros       | Server routes em `src/routes/api/public/*.ts`                 |
| ORM models (SQLAlchemy/Django ORM)     | Tabelas Postgres via migrations SQL                           |
| Forms/validação (WTForms, pydantic)    | zod + react-hook-form                                         |
| Sessão/login                           | Auth do Lovable Cloud (ver abaixo)                            |
| Celery/cron                            | Endpoint em `/api/public/...` chamado por agendador (pg_cron) |
| Variáveis de ambiente / .env           | Secrets (lidos com `process.env.X` DENTRO do handler)         |
| Upload de arquivos (disco local)       | Storage do Lovable Cloud (buckets)                            |

## Padrão de server function

```ts
// src/lib/clientes.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getCliente = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["MINHA_API_KEY"]; // ler env só aqui dentro
    return buscarCliente(data.id);
  });
```

- Não colocar server functions em `src/server/`.
- Componentes importam `*.functions.ts`, nunca `*.server.ts`.

## Padrão de rota com dados

```tsx
export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — App" }, { name: "description", content: "..." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(clientesQuery),
  component: Page,
});

function Page() {
  const { data } = useSuspenseQuery(clientesQuery);
  // ...
}
```

- Navegação com `<Link to="/clientes/$id" params={{ id }}>`, nunca `<a href>` interno.
- Toda rota precisa de `head()` próprio (title, description, og:title, og:description).

## Banco de dados (Postgres gerenciado)

- Entregar o schema como arquivos SQL de migration, em ordem:
  1. `CREATE TABLE public.x (...)`
  2. `GRANT SELECT, INSERT, UPDATE, DELETE ON public.x TO authenticated; GRANT ALL ON public.x TO service_role;`
  3. `ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;`
  4. `CREATE POLICY ...` (normalmente escopadas por `auth.uid()`)
- Papéis (admin etc.) ficam em tabela separada `user_roles`, com enum `app_role` e função `has_role()` SECURITY DEFINER. Nunca guardar papel na tabela de perfil.
- Chave estrangeira de usuário: `user_id uuid references auth.users(id)`.
- Dados iniciais vão como INSERTs na migration.
- NÃO escrever o client de conexão do banco: ele é gerado pelo Lovable quando o Cloud é ativado. Deixar as leituras e escritas em funções isoladas (`*.server.ts`) para facilitar a ligação depois.

## Autenticação (regra do workspace)

- Permitidos APENAS: Microsoft (Entra ID), SAML SSO, Lovable.
- Proibidos: e-mail/senha, telefone, Google, Apple.
- Nunca checar admin no cliente/localStorage.

## Restrições do runtime (servidor)

- Não usar: `child_process`, `sharp`, `canvas`, `puppeteer`, `fs.watch`, libs com binário nativo (node-gyp).
- OK usar: `fetch`, `crypto`, `Buffer`, streams, `zlib`, libs JS puras.
- Processamento pesado (PDF, imagem, ML em Python) → substituir por lib JS ou API externa.

## Design

- Todas as cores como tokens semânticos em `src/styles.css` (oklch): `--background`, `--primary` etc.
- Nos componentes, usar só classes semânticas (`bg-primary`, `text-muted-foreground`). Nada de `bg-white` ou `#hex`.
- Variantes novas vão no componente (ex.: `<Button variant="hero">`), não em className avulso.
- Fontes web via `<link>` no head do `__root.tsx`.

## Entregáveis esperados do refactor

1. Pasta `src/` completa nesse padrão
2. `supabase/migrations/*.sql` com schema + policies + seeds (nome de pasta padrão)
3. Lista de secrets necessários (só os nomes, sem valores)
4. Lista de endpoints externos/webhooks que precisam manter a URL
5. Dependências npm novas (compatíveis com o runtime edge)
