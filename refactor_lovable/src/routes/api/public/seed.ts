import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { tokenValido } from "@/lib/backup.server";
import { autorizarUsuarioInicial } from "@/lib/seed.server";

const entrada = z.object({
  email: z.email(),
  nome: z.string().trim().min(1),
  perfil: z.enum(["analista", "auditor"]).default("analista"),
});

/**
 * Seed inicial: autoriza um usuário (por padrão analista, o papel mais alto)
 * antes de existir alguém no painel para fazer isso. Protegida pelo CRON_SECRET.
 *
 *   curl -X POST https://<app>/api/public/seed \
 *     -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
 *     -d '{"email": "fulano@bernhoeft.com.br", "nome": "Fulano"}'
 *
 * Depois, a pessoa entra em /auth com a conta Microsoft desse e-mail.
 */
export const Route = createFileRoute("/api/public/seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!tokenValido(request, "CRON_SECRET")) {
          return Response.json({ detail: "Não autorizado." }, { status: 401 });
        }
        const corpo = entrada.safeParse(await request.json().catch(() => null));
        if (!corpo.success) {
          return Response.json(
            { detail: 'Envie {"email": "...", "nome": "..."} e, opcionalmente, "perfil": "analista" | "auditor".' },
            { status: 400 },
          );
        }
        try {
          return Response.json(await autorizarUsuarioInicial(corpo.data));
        } catch (e) {
          return Response.json({ detail: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
