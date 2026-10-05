import { createFileRoute } from "@tanstack/react-router";
import { linkDownload, listarBackups, tokenValido } from "@/lib/backup.server";

/**
 * Lista os backups ou baixa um deles (Authorization: Bearer <CRON_SECRET>).
 *   GET /api/public/backups                       → lista (mais recentes primeiro)
 *   GET /api/public/backups?arquivo=<nome>        → link de download válido por 10 min
 */
export const Route = createFileRoute("/api/public/backups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!tokenValido(request, "CRON_SECRET")) {
          return Response.json({ detail: "Não autorizado." }, { status: 401 });
        }
        try {
          const arquivo = new URL(request.url).searchParams.get("arquivo");
          if (arquivo) return Response.json({ arquivo, url: await linkDownload(arquivo) });
          return Response.json({ backups: await listarBackups() });
        } catch (e) {
          return Response.json({ detail: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
