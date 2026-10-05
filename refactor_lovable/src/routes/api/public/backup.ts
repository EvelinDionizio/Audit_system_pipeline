import { createFileRoute } from "@tanstack/react-router";
import { criarBackup, tokenValido } from "@/lib/backup.server";

/**
 * Gera um backup do banco no bucket `backups`.
 *
 * GET é o que o cron da Vercel chama (vercel.json), com
 * `Authorization: Bearer <CRON_SECRET>`. POST faz o mesmo, para uso manual:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/public/backup
 */
async function gerar(request: Request) {
  if (!tokenValido(request, "CRON_SECRET")) {
    return Response.json({ detail: "Não autorizado." }, { status: 401 });
  }
  try {
    return Response.json(await criarBackup());
  } catch (e) {
    return Response.json({ detail: (e as Error).message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/backup")({
  server: {
    handlers: {
      GET: ({ request }) => gerar(request),
      POST: ({ request }) => gerar(request),
    },
  },
});
