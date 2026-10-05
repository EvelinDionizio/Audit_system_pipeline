import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sair } from "@/lib/auth-client";

/** Substitui POST /api/logout. */
export function BotaoSair({ variant = "outline" }: { variant?: "outline" | "header" }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [saindo, setSaindo] = useState(false);

  async function handleSair() {
    setSaindo(true);
    await sair();
    queryClient.clear();
    await navigate({ to: "/auth" });
  }

  return (
    // type="button": dentro de um formulário (ex.: troca de senha), Enter não pode acionar o Sair.
    <Button type="button" variant={variant} size="sm" onClick={handleSair} disabled={saindo}>
      <LogOut />
      Sair
    </Button>
  );
}
