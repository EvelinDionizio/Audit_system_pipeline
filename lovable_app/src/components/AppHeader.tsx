import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  titulo: string;
  icone: ReactNode;
  /** Links extras antes de "Sair" */
  children?: ReactNode;
}

export function AppHeader({ titulo, icone, children }: Props) {
  const { usuario, sair } = useAuth();
  const navigate = useNavigate();

  async function handleSair() {
    await sair();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-[100] flex h-14 items-center justify-between bg-bh-azul px-5 shadow-[0_2px_8px_rgba(0,0,0,.2)]">
      <div className="flex items-center gap-2.5">
        {icone}
        <span className="text-[15px] font-semibold text-white">{titulo}</span>
      </div>
      <nav className="flex items-center gap-1">
        <span className="mr-2 text-xs text-white/60">{usuario?.nome}</span>
        {children}
        <HeaderLink onClick={handleSair} className="text-white/55">Sair</HeaderLink>
      </nav>
    </header>
  );
}

export function HeaderLink({ onClick, children, className = "" }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-[13px] text-white/75 transition hover:bg-white/10 hover:text-white ${className}`}
    >
      {children}
    </button>
  );
}

export function LogoRevisao() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect width="28" height="28" rx="6" fill="white" fillOpacity=".15" />
      <path d="M7 9h14M7 14h9M7 19h11" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LogoAnalista() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect width="28" height="28" rx="6" fill="white" fillOpacity=".15" />
      <path d="M4 7h20M4 14h14M4 21h17" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
