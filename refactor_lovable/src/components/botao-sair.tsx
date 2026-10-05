import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sair } from "@/lib/auth-client";

/** Substitui POST /api/logout. */
export function BotaoSair() {
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
    <Button variant="outline" size="sm" onClick={handleSair} disabled={saindo}>
      <LogOut />
      Sair
    </Button>
  );
}
