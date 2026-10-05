import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { restaurarBackup, tokenValido } from "@/lib/backup.server";

const entrada = z.union([
  z.object({ arquivo: z.string().min(1), confirmar: z.literal("RESTAURAR") }),
  z.object({ url: z.url(), confirmar: z.literal("RESTAURAR") }),
]);

/**
 * Restaura o banco a partir de um backup. SUBSTITUI todos os dados.
 *
 * Fechada por padrão: só funciona com o secret RESTORE_TOKEN configurado
 * (diferente do CRON_SECRET, para que quem gera backups não possa apagar o banco).
 *
 *   curl -X POST https://<app>/api/public/restaurar \
 *     -H "Authorization: Bearer $RESTORE_TOKEN" -H "Content-Type: application/json" \
 *     -d '{"arquivo": "backup-2026-10-05T06-00-00-000Z.json.gz", "confirmar": "RESTAURAR"}'
 *
 * Em vez de `arquivo` (bucket `backups` deste projeto), aceita `url`: um link
 * de download, ex.: gerado em /api/public/backups?arquivo=… no projeto antigo.
 */
export const Route = createFileRoute("/api/public/restaurar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!tokenValido(request, "RESTORE_TOKEN")) {
          return Response.json({ detail: "Não autorizado." }, { status: 401 });
        }
        const corpo = entrada.safeParse(await request.json().catch(() => null));
        if (!corpo.success) {
          return Response.json(
            { detail: 'Envie {"arquivo": "<nome>"} ou {"url": "<link>"} com "confirmar": "RESTAURAR".' },
            { status: 400 },
          );
        }
        try {
          const origem = "arquivo" in corpo.data ? { arquivo: corpo.data.arquivo } : { url: corpo.data.url };
          return Response.json(await restaurarBackup(origem));
        } catch (e) {
          return Response.json({ detail: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
