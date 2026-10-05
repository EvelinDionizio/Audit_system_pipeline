import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as analista from "@/lib/analista.server";
import { analistaMiddleware } from "@/lib/auth-middleware";

export type { UsuarioPainel } from "@/lib/analista.server";

const papel = z.enum(["analista", "auditor"]);
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

// ── Auditorias ───────────────────────────────────────────────────────────────

const filtroAuditorias = z.object({
  status: z.array(z.number().int()),
  limite: z.number().int().min(1).max(500),
  de: dataIso,
  ate: dataIso,
});

export const listarAuditorias = createServerFn({ method: "GET" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) => filtroAuditorias.parse(d))
  .handler(({ data, context }) => analista.listarAuditorias(context.supabase, data));

export const auditoriasQuery = (filtro: z.infer<typeof filtroAuditorias>) =>
  queryOptions({
    queryKey: ["analista", "auditorias", filtro],
    queryFn: () => listarAuditorias({ data: filtro }),
  });

export const historicoReprocessamentos = createServerFn({ method: "GET" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) => z.object({ evaluation_id: z.number().int().positive() }).parse(d))
  .handler(({ data, context }) => analista.historicoReprocessamentos(context.supabase, data.evaluation_id));

// ── Indicadores e tokens ─────────────────────────────────────────────────────

export const scoreAuditores = createServerFn({ method: "GET" })
  .middleware([analistaMiddleware])
  .handler(({ context }) => analista.scoreAuditores(context.supabase));

export const scoreQuery = () =>
  queryOptions({ queryKey: ["analista", "score"], queryFn: () => scoreAuditores() });

export const usoTokens = createServerFn({ method: "GET" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) => z.object({ dias: z.number().int().min(1).max(365) }).parse(d))
  .handler(({ data, context }) => analista.usoTokens(context.supabase, data.dias));

export const tokensQuery = (dias: number) =>
  queryOptions({ queryKey: ["analista", "tokens", dias], queryFn: () => usoTokens({ data: { dias } }) });

// ── Usuários ─────────────────────────────────────────────────────────────────

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([analistaMiddleware])
  .handler(({ context }) => analista.listarUsuarios(context.supabase));

export const usuariosQuery = () =>
  queryOptions({ queryKey: ["analista", "usuarios"], queryFn: () => listarUsuarios() });

export const autorizarUsuario = createServerFn({ method: "POST" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().email("E-mail inválido."),
        nome: z.string().trim().min(1, "Informe o nome."),
        perfil: papel,
      })
      .parse(d),
  )
  .handler(({ data, context }) => analista.autorizarUsuario(context.supabase, context.userId, data));

export const definirAtivo = createServerFn({ method: "POST" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(({ data, context }) => analista.definirAtivo(context.supabase, data.profileId, data.ativo));

export const removerAutorizacao = createServerFn({ method: "POST" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(({ data, context }) => analista.removerAutorizacao(context.supabase, data.email));

export const listarInativos = createServerFn({ method: "GET" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) => z.object({ dias: z.number().int().min(0) }).parse(d))
  .handler(({ data, context }) => analista.listarInativos(context.supabase, data.dias));

// ── Configuração de itens ────────────────────────────────────────────────────

export const regraItemSchema = z.object({
  checklist_id: z.string().trim().min(1, "Informe o ID do checklist ou da aplicação."),
  item_nome: z.string().trim().min(1, "Informe o nome do item."),
  habilitado: z.boolean(),
  validacao_tipo: z.enum(["obrigatorio", "sugestao"]),
  exige_imagem: z.boolean(),
});

export const listarConfigItens = createServerFn({ method: "GET" })
  .middleware([analistaMiddleware])
  .handler(({ context }) => analista.listarConfigItens(context.supabase));

export const configItensQuery = () =>
  queryOptions({ queryKey: ["analista", "config-itens"], queryFn: () => listarConfigItens() });

export const salvarConfigItem = createServerFn({ method: "POST" })
  .middleware([analistaMiddleware])
  .inputValidator((d: unknown) => regraItemSchema.parse(d))
  .handler(({ data, context }) => analista.salvarConfigItem(context.supabase, data));
