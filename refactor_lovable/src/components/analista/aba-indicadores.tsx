import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Estado } from "@/components/estado";
import { ScoreBadge } from "@/components/score-badge";
import { Button } from "@/components/ui/button";
import { scoreQuery } from "@/lib/analista.functions";
import { Filtros, Tabela, textoErro } from "./ui";

export function AbaIndicadores() {
  const consulta = useQuery(scoreQuery());

  return (
    <>
      <Filtros>
        <Button size="sm" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
          <RefreshCw /> Atualizar
        </Button>
      </Filtros>
      {consulta.isError ? (
        <Estado>{textoErro(consulta.error)}</Estado>
      ) : consulta.isPending ? (
        <Estado carregando />
      ) : consulta.data.length === 0 ? (
        <Estado>
          Nenhum dado ainda.
          <br />
          <span className="text-xs">Os indicadores são calculados a partir das auditorias processadas pelo sistema.</span>
        </Estado>
      ) : (
        <Tabela
          cabecalhos={[
            { t: "Auditor" },
            { t: "Auditorias", alinhar: "center" },
            { t: "Score médio", alinhar: "center" },
            { t: "Total NC", alinhar: "center" },
            { t: "Sugestões IA", alinhar: "center" },
            { t: "Aceitas", alinhar: "center" },
            { t: "Ignoradas", alinhar: "center" },
            { t: "Taxa aceitação", alinhar: "center" },
          ]}
        >
          {consulta.data.map((a) => (
            <tr key={a.auditor}>
              <td className="font-semibold">{a.auditor}</td>
              <td className="text-center font-bold text-primary">{a.total_auditorias}</td>
              <td className="text-center"><ScoreBadge pct={a.media_score} /></td>
              <td className="text-center font-semibold text-destructive">{a.total_nc}</td>
              <td className="text-center">{a.total_sugestoes}</td>
              <td className="text-center font-semibold text-success">{a.sugestoes_aceitas}</td>
              <td className="text-center text-muted-foreground">{a.sugestoes_ignoradas}</td>
              <td className="text-center"><ScoreBadge pct={a.taxa_aceitacao} /></td>
            </tr>
          ))}
        </Tabela>
      )}
    </>
  );
}
