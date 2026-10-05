import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Estado } from "@/components/estado";
import { Button } from "@/components/ui/button";
import { tokensQuery } from "@/lib/analista.functions";
import { Filtros, KpiCard, KpiGrid, Tabela, campoCls, textoErro } from "./ui";

// Cotação fixa usada no painel original para a estimativa em reais.
const USD_BRL = 6;

export function AbaTokens() {
  const [dias, setDias] = useState(30);
  const consulta = useQuery(tokensQuery(dias));
  const resumo = consulta.data?.resumo;
  const custoUsd = Number(resumo?.custo_total_usd ?? 0);

  return (
    <>
      <Filtros>
        <select aria-label="Período" className={campoCls} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        <Button size="sm" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
          <RefreshCw /> Atualizar
        </Button>
      </Filtros>

      {consulta.isError ? (
        <Estado>{textoErro(consulta.error)}</Estado>
      ) : consulta.isPending ? (
        <Estado carregando />
      ) : (
        <>
          <KpiGrid>
            <KpiCard
              pequeno
              label="Total de tokens"
              valor={Number(resumo?.total_tokens ?? 0).toLocaleString("pt-BR")}
              sub={`últimos ${dias} dias`}
            />
            <KpiCard
              pequeno
              label="Custo estimado"
              valor={`USD ${custoUsd.toFixed(4)}`}
              sub={`~R$ ${(custoUsd * USD_BRL).toFixed(2)}`}
              corValor="text-success"
            />
            <KpiCard pequeno label="Auditorias com IA" valor={Number(resumo?.auditorias_processadas ?? 0)} sub="revisões processadas" />
            <KpiCard pequeno label="Chamadas à API" valor={Number(resumo?.total_chamadas ?? 0)} sub="total de requisições" />
          </KpiGrid>

          {consulta.data.porDia.length === 0 ? (
            <Estado>
              Nenhum uso registrado neste período.
              <br />
              <span className="text-xs">O registro começa após a primeira revisão com a API ativa.</span>
            </Estado>
          ) : (
            <Tabela
              cabecalhos={[
                { t: "Dia" },
                { t: "Tokens", alinhar: "right" },
                { t: "Chamadas", alinhar: "right" },
                { t: "Custo", alinhar: "right" },
              ]}
            >
              {consulta.data.porDia.map((d) => (
                <tr key={d.dia}>
                  <td>{new Date(`${d.dia}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                  <td className="text-right">{Number(d.tokens ?? 0).toLocaleString("pt-BR")}</td>
                  <td className="text-right">{d.chamadas}</td>
                  <td className="text-right font-semibold text-success">USD {Number(d.custo_usd ?? 0).toFixed(4)}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </>
      )}
    </>
  );
}
