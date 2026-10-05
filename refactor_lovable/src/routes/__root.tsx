/// <reference types="vite/client" />
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AuthListener } from "@/components/auth-listener";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

/**
 * Shell HTML e layout global. Ao importar no Lovable, mesclar com o
 * __root.tsx do template se ele tiver algo a mais (ex.: devtools).
 */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sistema de Auditoria — Bernhoeft" },
      { name: "description", content: "Revisão técnica de auditorias com IA da Bernhoeft." },
      { property: "og:title", content: "Sistema de Auditoria — Bernhoeft" },
      { property: "og:description", content: "Revisão técnica de auditorias com IA da Bernhoeft." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: NaoEncontrado,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <>
      <AuthListener />
      <Outlet />
      <Toaster richColors position="top-right" />
    </>
  );
}

function NaoEncontrado() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-2xl font-semibold text-primary">Página não encontrada</h1>
      <Link to="/" className="text-sm text-info underline-offset-4 hover:underline">
        Voltar para a revisão
      </Link>
    </main>
  );
}
