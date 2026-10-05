import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reage a logout feito fora do BotaoSair (sessão expirada, logout em outra
 * aba): limpa o cache e reavalia as rotas, que mandam para /auth.
 * Montar uma vez no __root.tsx.
 */
export function AuthListener() {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        void router.invalidate();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient, router]);

  return null;
}
