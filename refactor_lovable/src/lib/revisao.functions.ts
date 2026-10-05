import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth-middleware";
import { executarRevisao } from "@/lib/revisao.server";
import { criarClienteAdmin } from "@/lib/supabase-admin.server";

export type { ResultadoRevisao, SugestaoRevisao } from "@/lib/revisao.server";

/** Substitui POST /api/revisar. */
export const revisarAuditoria = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((dados: unknown) =>
    z.object({ evaluation_id: z.number().int().positive() }).parse(dados),
  )
  .handler(({ data, context }) =>
    executarRevisao(context.supabase, criarClienteAdmin(), context.userId, data.evaluation_id),
  );

/**
 * Substitui POST /api/feedback. Roda como o usuário: o RLS só deixa marcar
 * sugestões vigentes de auditorias que ele processou (ou qualquer uma, se analista).
 */
export const registrarFeedback = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((dados: unknown) =>
    z.object({ sugestao_id: z.number().int().positive(), aceita: z.boolean() }).parse(dados),
  )
  .handler(async ({ data, context }) => {
    const { data: linhas, error } = await context.supabase
      .from("sugestoes")
      .update({ aceita: data.aceita })
      .eq("id", data.sugestao_id)
      .select("id");
    if (error) {
      throw new Error(`Erro ao registrar o feedback: ${error.message}`);
    }
    if (linhas.length === 0) {
      throw new Error("Sugestão não encontrada, já substituída ou sem permissão.");
    }
    return { ok: true };
  });
