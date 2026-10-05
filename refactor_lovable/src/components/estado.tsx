import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Carregando"
      className={cn(
        "mx-auto size-8 animate-spin rounded-full border-[3px] border-border border-t-primary",
        className,
      )}
    />
  );
}

/** Estado vazio, carregando ou de erro, centralizado (classe .estado das páginas originais). */
export function Estado({ carregando, children }: { carregando?: boolean; children?: ReactNode }) {
  return (
    <div className="px-5 py-14 text-center text-sm text-muted-foreground">
      {carregando && <Spinner className="mb-3.5" />}
      {children ?? (carregando ? "Carregando…" : null)}
    </div>
  );
}
