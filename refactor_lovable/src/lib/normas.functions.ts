import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth-middleware";
import { exigirAnalista } from "@/lib/auth.server";
import { indexarPdfDaNorma, removerNormaDoBanco } from "@/lib/normas.server";
import { criarClienteAdmin } from "@/lib/supabase-admin.server";

// Os PDFs ficam na raiz do bucket: o nome do arquivo identifica a norma
// (coluna normas_chunks.fonte) e é usado para removê-la depois.
const nomeDePdf = z
  .string()
  .min(1)
  .refine((v) => v.toLowerCase().endsWith(".pdf"), "Envie um arquivo PDF.")
  .refine((v) => !v.includes("/"), "Envie o PDF na raiz do bucket, sem pastas.");

/** Normas indexadas, com total de trechos e páginas (aba Configurações do analista). */
export const listarNormas = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await exigirAnalista(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("listar_normas");
    if (error) {
      throw new Error(`Erro ao listar normas: ${error.message}`);
    }
    return data;
  });

/**
 * Indexa (ou reindexa) um PDF já enviado ao bucket "normas".
 * Fluxo da tela: upload no Storage → chamar esta função com o caminho.
 */
export const indexarNorma = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((dados: unknown) => z.object({ caminho: nomeDePdf }).parse(dados))
  .handler(async ({ data, context }) => {
    await exigirAnalista(context.supabase, context.userId);
    return indexarPdfDaNorma(criarClienteAdmin(), data.caminho);
  });

export const removerNorma = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((dados: unknown) => z.object({ fonte: nomeDePdf }).parse(dados))
  .handler(async ({ data, context }) => {
    await exigirAnalista(context.supabase, context.userId);
    const removidos = await removerNormaDoBanco(criarClienteAdmin(), data.fonte);
    return { fonte: data.fonte, removidos };
  });
