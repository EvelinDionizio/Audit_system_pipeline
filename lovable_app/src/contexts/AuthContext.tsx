import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Perfil, Usuario } from "@/lib/types";

interface AuthState {
  session: Session | null;
  usuario: Usuario | null;
  carregando: boolean;
  recarregarPerfil: () => Promise<void>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Lê perfil + papel do usuário logado (RLS: cada um vê o próprio). */
export async function buscarUsuario(id: string): Promise<Usuario | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, nome, email, ativo, senha_alterada_em, ultimo_acesso, user_roles(role)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const roles = data.user_roles as { role: Perfil } | { role: Perfil }[] | null;
  const perfil = (Array.isArray(roles) ? roles[0]?.role : roles?.role) ?? "auditor";
  return {
    id: data.id,
    nome: data.nome,
    email: data.email,
    ativo: data.ativo,
    senha_alterada_em: data.senha_alterada_em,
    ultimo_acesso: data.ultimo_acesso,
    perfil,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessaoPronta, setSessaoPronta] = useState(false);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [perfilDe, setPerfilDe] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessaoPronta(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id ?? null;

  const recarregarPerfil = useCallback(async () => {
    if (!uid) {
      setUsuario(null);
      setPerfilDe(null);
      return;
    }
    setUsuario(await buscarUsuario(uid));
    setPerfilDe(uid);
  }, [uid]);

  useEffect(() => {
    recarregarPerfil();
  }, [recarregarPerfil]);

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
    setUsuario(null);
    setPerfilDe(null);
  }, []);

  const carregando = !sessaoPronta || (uid !== null && perfilDe !== uid);

  return (
    <AuthContext.Provider value={{ session, usuario, carregando, recarregarPerfil, sair }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
