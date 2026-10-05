import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exigir } from "@/lib/api";
import type { ScoreAuditor } from "@/lib/types";
import { Estado } from "@/components/Estado";
import { BotaoAtualizar, Filtros, ScoreBadge, Tabela } from "./ui";

export function AbaIndicadores() {
  const [auditores, setAuditores] = useState<ScoreAuditor[] | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setAuditores(null);
    setErro(false);
    try {
      setAuditores(exigir(await supabase.from("v_score_auditores").select("*")) as ScoreAuditor[]);
    } catch {
      setErro(true);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <>
      <Filtros><BotaoAtualizar onClick={carregar} /></Filtros>
      {erro ? (
        <Estado>Erro ao carregar.</Estado>
      ) : auditores === null ? (
        <Estado carregando />
      ) : auditores.length === 0 ? (
        <Estado>
          Nenhum dado ainda.<br />
          <span className="text-xs">Indicadores são calculados a partir das auditorias processadas pelo sistema.</span>
        </Estado>
      ) : (
        <Tabela
          cabecalhos={[
            { t: "Auditor" }, { t: "Auditorias" }, { t: "Score médio" }, { t: "Total NC" },
            { t: "Sugestões IA" }, { t: "Aceitas" }, { t: "Ignoradas" }, { t: "Taxa aceitação" },
          ]}
        >
          {auditores.map((a) => (
            <tr key={a.auditor}>
              <td className="font-semibold">{a.auditor}</td>
              <td className="text-center font-bold text-bh-azul">{a.total_auditorias}</td>
              <td className="text-center"><ScoreBadge pct={a.media_score} /></td>
              <td className="text-center font-semibold text-bh-vermelho">{a.total_nc}</td>
              <td className="text-center">{a.total_sugestoes || 0}</td>
              <td className="text-center font-semibold text-bh-verde">{a.sugestoes_aceitas || 0}</td>
              <td className="text-center text-bh-cinza">{a.sugestoes_ignoradas || 0}</td>
              <td className="text-center"><ScoreBadge pct={a.taxa_aceitacao} nivel={a.taxa_aceitacao === null ? "critico" : undefined} /></td>
            </tr>
          ))}
        </Tabela>
      )}
    </>
  );
}
