import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { diasAteExpirarSenha } from "@/lib/senha";
import { Estado } from "./Estado";

/**
 * Substitui o redirecionamento para /login feito no topo de cada página HTML
 * e o require_analista() da rota /analista.
 */
export function ProtectedRoute({ children, analista = false }: { children: ReactNode; analista?: boolean }) {
  const { session, usuario, carregando } = useAuth();

  if (carregando) return <Estado carregando />;
  if (!session || !usuario || !usuario.ativo) return <Navigate to="/login" replace />;
  // A política de 90 dias passa a ser aplicada de fato (no original bastava ignorar o aviso).
  if (diasAteExpirarSenha(usuario.senha_alterada_em) < 0) return <Navigate to="/login?expirada=1" replace />;
  if (analista && usuario.perfil !== "analista") return <Navigate to="/" replace />;

  return <>{children}</>;
}
