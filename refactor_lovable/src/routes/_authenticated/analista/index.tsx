import { Link, createFileRoute } from "@tanstack/react-router";
import { BarChart3, ClipboardList, Coins, Settings, Users } from "lucide-react";
import { useCallback, useState } from "react";
import { z } from "zod";
import { AbaAuditorias } from "@/components/analista/aba-auditorias";
import { AbaConfiguracoes } from "@/components/analista/aba-configuracoes";
import { AbaIndicadores } from "@/components/analista/aba-indicadores";
import { AbaTokens } from "@/components/analista/aba-tokens";
import { AbaUsuarios } from "@/components/analista/aba-usuarios";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ABAS = ["auditorias", "indicadores", "usuarios", "configuracoes", "tokens"] as const;
type Aba = (typeof ABAS)[number];

const searchSchema = z.object({
  aba: z.enum(ABAS).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/analista/")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Painel do Analista — Bernhoeft" },
      { name: "description", content: "Auditorias, indicadores, usuários, configurações e custo de IA." },
      { property: "og:title", content: "Painel do Analista — Bernhoeft" },
      { property: "og:description", content: "Auditorias, indicadores, usuários, configurações e custo de IA." },
    ],
  }),
  component: PainelAnalista,
});

function PainelAnalista() {
  const { aba = "auditorias" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [totalUsuarios, setTotalUsuarios] = useState<number | null>(null);
  const onTotalUsuarios = useCallback((n: number) => setTotalUsuarios(n), []);

  const gatilho = "gap-1.5 text-[13px] [&_svg]:size-[13px]";

  return (
    <div className="min-h-screen">
      <AppHeader titulo="Painel do Analista">
        <Button variant="header" size="sm" asChild>
          <Link to="/">← Revisão</Link>
        </Button>
      </AppHeader>

      <Tabs value={aba} onValueChange={(v) => void navigate({ search: { aba: v as Aba }, replace: true })}>
        <div className="sticky top-14 z-40 overflow-x-auto border-b bg-card px-6 shadow-sm">
          <TabsList className="h-12 bg-transparent">
            <TabsTrigger value="auditorias" className={gatilho}><ClipboardList /> Auditorias</TabsTrigger>
            <TabsTrigger value="indicadores" className={gatilho}><BarChart3 /> Indicadores</TabsTrigger>
            <TabsTrigger value="usuarios" className={gatilho}>
              <Users /> Usuários <Badge variant="secondary" className="px-1.5 text-[10px]">{totalUsuarios ?? "—"}</Badge>
            </TabsTrigger>
            <TabsTrigger value="configuracoes" className={gatilho}><Settings /> Configurações</TabsTrigger>
            <TabsTrigger value="tokens" className={gatilho}><Coins /> Tokens & Custo</TabsTrigger>
          </TabsList>
        </div>

        <main className="mx-auto max-w-[1200px] px-5 pb-16 pt-6">
          <TabsContent value="auditorias"><AbaAuditorias /></TabsContent>
          <TabsContent value="indicadores"><AbaIndicadores /></TabsContent>
          {/* Montada sempre, como no original: alimenta o contador da aba. */}
          <TabsContent value="usuarios" forceMount className="data-[state=inactive]:hidden">
            <AbaUsuarios onTotal={onTotalUsuarios} />
          </TabsContent>
          <TabsContent value="configuracoes"><AbaConfiguracoes /></TabsContent>
          <TabsContent value="tokens"><AbaTokens /></TabsContent>
        </main>
      </Tabs>
    </div>
  );
}
