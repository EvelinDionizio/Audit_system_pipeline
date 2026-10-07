import { Link, useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BotaoSair } from "@/components/botao-sair";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MODO_DEMO } from "@/lib/auth-client";

/** Cabeçalho azul das páginas autenticadas (revisão e painel). */
export function AppHeader({ titulo, children }: { titulo: string; children?: ReactNode }) {
  const { me } = useRouteContext({ from: "/_authenticated" });

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between bg-header px-5 shadow-md">
      <div className="flex items-center gap-2.5">
        <Logo />
        <span className="text-[15px] font-semibold text-header-foreground">{titulo}</span>
        {MODO_DEMO && <Badge variant="warning">Demonstração</Badge>}
      </div>
      <nav className="flex items-center gap-1">
        <span className="mr-2 text-xs text-header-foreground/60 max-sm:hidden">{me.nome}</span>
        {children}
        {me.tipo_acesso === "senha" && (
          <Button variant="header" size="sm" asChild>
            <Link to="/alterar-senha">Trocar senha</Link>
          </Button>
        )}
        <BotaoSair variant="header" />
      </nav>
    </header>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden className="text-header-foreground">
      <rect width="28" height="28" rx="6" fill="currentColor" fillOpacity=".15" />
      <path d="M7 9h14M7 14h9M7 19h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
