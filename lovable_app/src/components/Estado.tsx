import type { ReactNode } from "react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-bh-borda border-t-bh-azul ${className}`}
      aria-label="Carregando"
    />
  );
}

/** Estado vazio/carregando/erro centralizado (classe .estado das páginas originais). */
export function Estado({ carregando, children }: { carregando?: boolean; children?: ReactNode }) {
  return (
    <div className="px-5 py-14 text-center text-sm text-bh-cinza">
      {carregando && <Spinner className="mb-3.5" />}
      {children ?? (carregando ? "Carregando…" : null)}
    </div>
  );
}
