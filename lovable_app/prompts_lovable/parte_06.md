Parte 6 de 11 — frontend. Crie os 6 arquivos abaixo com exatamente este conteúdo. Não corrija erros de build ainda; responda apenas "Parte 6 recebida" com a lista de arquivos.

### `src/lib/exportExcel.ts`

````ts
// Exportação do painel de auditorias para Excel — porta de src/utils/export_excel.py.
// Mesmas abas (Resumo, Não Conformidades, Audit_<id>), cores, larguras e alturas.
import ExcelJS from "exceljs";
import { extrairSecao } from "./format";
import type { Payload, PayloadItem } from "./types";

const COR = {
  azulEscuro: "1F3864",
  azulMedio: "2E5FA3",
  azulClaro: "D6E4F7",
  vermelho: "C00000",
  vermelhoBg: "FCE4D6",
  amareloBg: "FFF2CC",
  amareloTx: "7F6000",
  verde: "217346",
  verdeBg: "E2EFDA",
  cinzaHeader: "F2F2F2",
  cinzaBorda: "CCCCCC",
  branco: "FFFFFF",
  parecerBg: "EEF4FB",
};
const FONTE = "Arial";
const SEM_PARECER = "Parecer não gerado — API key pendente.";

const argb = (hex: string) => ({ argb: `FF${hex}` });
const fill = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: argb(hex) });
const borda = (): Partial<ExcelJS.Borders> => {
  const lado = { style: "thin" as const, color: argb(COR.cinzaBorda) };
  return { top: lado, left: lado, bottom: lado, right: lado };
};

type Valor = string | number | null | undefined;

function headerCell(ws: ExcelJS.Worksheet, r: number, c: number, v: Valor, bg = COR.azulEscuro, fg = COR.branco) {
  const cell = ws.getCell(r, c);
  cell.value = v ?? null;
  cell.font = { name: FONTE, bold: true, size: 10, color: argb(fg) };
  cell.fill = fill(bg);
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = borda();
  return cell;
}

function dataCell(
  ws: ExcelJS.Worksheet, r: number, c: number, v: Valor,
  { bg = COR.branco, bold = false, align = "left", color = "000000" }:
    { bg?: string; bold?: boolean; align?: "left" | "center"; color?: string } = {},
) {
  const cell = ws.getCell(r, c);
  cell.value = v ?? null;
  cell.font = { name: FONTE, size: 10, bold, color: argb(color) };
  cell.fill = fill(bg);
  cell.alignment = { horizontal: align, vertical: "top", wrapText: true };
  cell.border = borda();
  return cell;
}

function coloredCell(ws: ExcelJS.Worksheet, r: number, c: number, v: Valor, bg: string, fg: string) {
  const cell = dataCell(ws, r, c, v, { bg, bold: true, align: "center", color: fg });
  return cell;
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function scoreLabel(codigo: number | null): string {
  const mapa: Record<number, string> = { 1: "Não Atingiu", 2: "Parcial", 3: "Atingiu", 4: "Não Atingiu", 6: "N/A" };
  return codigo !== null ? mapa[codigo] ?? "—" : "—";
}

function scoreBg(codigo: number | null): string {
  if (codigo === 1 || codigo === 4) return COR.vermelhoBg;
  if (codigo === 2) return COR.amareloBg;
  if (codigo === 3) return COR.verdeBg;
  return COR.cinzaHeader;
}

function coresCriticidade(crit: string): [string, string] {
  const c = crit.toUpperCase();
  if (c.includes("ALTA")) return [COR.vermelhoBg, COR.vermelho];
  if (c.includes("MÉDIA") || c.includes("MEDIA")) return [COR.amareloBg, COR.amareloTx];
  return [COR.verdeBg, COR.verde];
}

function larguras(ws: ExcelJS.Worksheet, ws_: number[]) {
  ws_.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

function titulo(ws: ExcelJS.Worksheet, range: string, texto: string, bg: string, size: number, altura: number) {
  ws.mergeCells(range);
  const c = ws.getCell(range.split(":")[0]);
  c.value = texto;
  c.font = { name: FONTE, bold: true, size, color: argb(COR.branco) };
  c.fill = fill(bg);
  c.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = altura;
}

// ── Aba RESUMO ───────────────────────────────────────────────────────────────
function buildResumo(wb: ExcelJS.Workbook, payloads: Payload[]) {
  const ws = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  titulo(ws, "A1:I1", "PAINEL DE AUDITORIAS — CHECKLIST FÁCIL", COR.azulEscuro, 14, 36);

  ws.mergeCells("A2:I2");
  const sub = ws.getCell("A2");
  const agora = new Date();
  sub.value = `Gerado em ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}  |  ${payloads.length} auditoria(s) em análise`;
  sub.font = { name: FONTE, size: 10, color: argb("666666") };
  sub.fill = fill(COR.cinzaHeader);
  sub.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 22;

  const totalNc = payloads.reduce((s, p) => s + p.resumo.total_nao_conformes, 0);
  const totalPc = payloads.reduce((s, p) => s + p.resumo.total_parciais, 0);
  const totalPareceres = payloads.reduce((s, p) => s + (p.resumo.total_com_parecer ?? 0), 0);
  const kpis: [string, number, string][] = [
    ["Auditorias", payloads.length, COR.azulMedio],
    ["Não Conformes", totalNc, COR.vermelho],
    ["Parciais", totalPc, COR.amareloTx],
    ["Com Parecer", totalPareceres, COR.verde],
  ];
  ws.getRow(3).height = 10;
  ws.getRow(4).height = 40;
  ws.getRow(5).height = 22;
  ws.getRow(6).height = 10;
  kpis.forEach(([label, valor, cor], i) => {
    const col = 1 + i * 2;
    ws.mergeCells(4, col, 4, col + 1);
    ws.mergeCells(5, col, 5, col + 1);
    const v = ws.getCell(4, col);
    v.value = String(valor);
    v.font = { name: FONTE, bold: true, size: 20, color: argb(cor) };
    v.alignment = { horizontal: "center", vertical: "middle" };
    const l = ws.getCell(5, col);
    l.value = label;
    l.font = { name: FONTE, size: 10, color: argb("444444") };
    l.alignment = { horizontal: "center", vertical: "middle" };
  });

  const headers = ["ID", "Checklist", "Unidade", "Data Início", "Data Conclusão", "Não Conf.", "Parciais", "Status", "Aba de Detalhes"];
  ws.getRow(7).height = 28;
  headers.forEach((h, i) => headerCell(ws, 7, i + 1, h, COR.azulMedio));

  payloads.forEach((p, idx) => {
    const r = 8 + idx;
    const { cabecalho: cab, resumo: res } = p;
    ws.getRow(r).height = 36;
    const [label, bg, fg] =
      res.total_nao_conformes > 0 ? ["⚠ NÃO CONFORME", COR.vermelhoBg, COR.vermelho]
      : res.total_parciais > 0 ? ["◑ PARCIAL", COR.amareloBg, COR.amareloTx]
      : ["✓ CONFORME", COR.verdeBg, COR.verde];
    const alt = r % 2 === 0 ? COR.cinzaHeader : COR.branco;

    dataCell(ws, r, 1, cab.id, { bg: alt, bold: true, align: "center" });
    dataCell(ws, r, 2, cab.checklist_nome, { bg: alt });
    dataCell(ws, r, 3, cab.unidade_nome, { bg: alt });
    dataCell(ws, r, 4, fmtData(cab.data_inicio), { bg: alt, align: "center" });
    dataCell(ws, r, 5, fmtData(cab.data_conclusao), { bg: alt, align: "center" });
    const nc = res.total_nao_conformes;
    const pc = res.total_parciais;
    coloredCell(ws, r, 6, nc, nc > 0 ? COR.vermelhoBg : alt, nc > 0 ? COR.vermelho : "000000");
    coloredCell(ws, r, 7, pc, pc > 0 ? COR.amareloBg : alt, pc > 0 ? COR.amareloTx : "000000");
    coloredCell(ws, r, 8, label, bg, fg);
    dataCell(ws, r, 9, `Audit_${cab.id}`, { bg: alt, color: COR.azulMedio, align: "center" });
  });

  larguras(ws, [14, 28, 30, 18, 18, 11, 11, 18, 18]);
}

// ── Aba NÃO CONFORMIDADES ────────────────────────────────────────────────────
function buildNaoConformidades(wb: ExcelJS.Workbook, payloads: Payload[]) {
  const ws = wb.addWorksheet("Não Conformidades", { views: [{ showGridLines: false }] });
  titulo(ws, "A1:H1", "CONSOLIDADO DE NÃO CONFORMIDADES E ITENS PARCIAIS", COR.vermelho, 13, 32);

  const headers = ["ID Auditoria", "Checklist", "Categoria", "Pergunta", "Classificação", "Comentário do Auditor", "Parecer Técnico", "Criticidade"];
  ws.getRow(2).height = 28;
  headers.forEach((h, i) => headerCell(ws, 2, i + 1, h, COR.azulMedio));

  let row = 3;
  for (const p of payloads) {
    for (const item of p.itens.filter((i) => i.nao_conforme || i.parcial)) {
      ws.getRow(row).height = 100;
      const parecer = item.parecer ?? "";
      const crit = parecer ? extrairSecao(parecer, "Criticidade") : "—";
      const [bgCrit, fgCrit] = coresCriticidade(crit);

      dataCell(ws, row, 1, p.cabecalho.id, { align: "center", bold: true });
      dataCell(ws, row, 2, p.cabecalho.checklist_nome);
      dataCell(ws, row, 3, item.categoria, { bg: COR.azulClaro });
      dataCell(ws, row, 4, item.pergunta);
      coloredCell(ws, row, 5, item.nao_conforme ? "Não Conforme" : "Parcial",
        item.nao_conforme ? COR.vermelhoBg : COR.amareloBg, item.nao_conforme ? COR.vermelho : COR.amareloTx);
      dataCell(ws, row, 6, item.comentario || item.resposta_texto || "—");
      dataCell(ws, row, 7, parecer || SEM_PARECER, { bg: COR.parecerBg });
      coloredCell(ws, row, 8, crit, bgCrit, fgCrit);
      row++;
    }
  }
  larguras(ws, [14, 24, 26, 40, 16, 50, 70, 18]);
}

// ── Aba por AUDITORIA ────────────────────────────────────────────────────────
function buildAuditoria(wb: ExcelJS.Workbook, p: Payload) {
  const { cabecalho: cab, resumo: res } = p;
  const ws = wb.addWorksheet(`Audit_${cab.id}`.slice(0, 31), { views: [{ showGridLines: false }] });
  titulo(ws, "A1:H1", `AUDITORIA #${cab.id} — ${cab.checklist_nome ?? ""}`, COR.azulEscuro, 13, 32);

  const meta: [string, Valor, string, Valor][] = [
    ["Unidade", cab.unidade_nome, "Auditor", cab.auditor_nome],
    ["Início", fmtData(cab.data_inicio), "Conclusão", fmtData(cab.data_conclusao)],
    ["Depto.", (cab.departamento ?? []).join(", ") || "—", "Itens relevantes", res.total_itens_relevantes],
    ["Não Conf.", res.total_nao_conformes, "Parciais", res.total_parciais],
  ];
  meta.forEach(([l1, v1, l2, v2], i) => {
    const r = 2 + i;
    ws.getRow(r).height = 22;
    headerCell(ws, r, 1, l1, COR.azulClaro, COR.azulEscuro);
    dataCell(ws, r, 2, v1);
    headerCell(ws, r, 4, l2, COR.azulClaro, COR.azulEscuro);
    dataCell(ws, r, 5, v2);
  });
  ws.getRow(6).height = 10;

  const headers = ["Categoria", "Pergunta", "Tipo", "Resultado", "Comentário do Auditor", "Resposta Texto", "Parecer Técnico", "Criticidade"];
  ws.getRow(7).height = 28;
  headers.forEach((h, i) => headerCell(ws, 7, i + 1, h, COR.azulMedio));

  let row = 8;
  let catAtual: string | null = null;
  for (const item of p.itens as PayloadItem[]) {
    if (item.categoria !== catAtual) {
      catAtual = item.categoria;
      ws.mergeCells(row, 1, row, 8);
      const c = ws.getCell(row, 1);
      c.value = `  ${catAtual}`;
      c.font = { name: FONTE, bold: true, size: 10, color: argb(COR.branco) };
      c.fill = fill(COR.azulMedio);
      c.alignment = { horizontal: "left", vertical: "middle" };
      ws.getRow(row).height = 22;
      row++;
    }

    const problema = item.nao_conforme || item.parcial;
    ws.getRow(row).height = problema ? 120 : 70;
    const bgRow = item.nao_conforme ? COR.vermelhoBg : item.parcial ? COR.amareloBg : COR.branco;
    const parecer = item.parecer ?? "";
    const crit = parecer ? extrairSecao(parecer, "Criticidade") : "—";
    const [bgCrit, fgCrit] = coresCriticidade(crit);

    dataCell(ws, row, 1, item.categoria, { bg: bgRow });
    dataCell(ws, row, 2, item.pergunta, { bg: bgRow });
    dataCell(ws, row, 3, item.tipo_resposta === "texto" ? "Texto" : "Avaliativo", { bg: bgRow, align: "center" });
    coloredCell(ws, row, 4, scoreLabel(item.resposta_codigo), scoreBg(item.resposta_codigo), "000000");
    dataCell(ws, row, 5, item.comentario || "—", { bg: bgRow });
    dataCell(ws, row, 6, item.resposta_texto || "—", { bg: bgRow });
    if (problema) {
      dataCell(ws, row, 7, parecer || SEM_PARECER, { bg: COR.parecerBg });
      coloredCell(ws, row, 8, crit, bgCrit, fgCrit);
    } else {
      dataCell(ws, row, 7, "—");
      dataCell(ws, row, 8, "—", { align: "center" });
    }
    row++;
  }
  larguras(ws, [26, 40, 10, 16, 50, 40, 70, 18]);
}

export async function exportarExcel(payloads: Payload[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  buildResumo(wb, payloads);
  buildNaoConformidades(wb, payloads);
  payloads.forEach((p) => buildAuditoria(wb, p));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `painel_auditorias_${ts}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
````
### `src/contexts/AuthContext.tsx`

````tsx
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
````
### `src/components/Estado.tsx`

````tsx
import type { ReactNode } from "react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-bh-borda border-t-bh-azul ${className}`}
      aria-label="Carregando"
    />
  );
}

/** Estado vazio/carregando/erro centralizado (classe .estado das páginas originais). */
export function Estado({ carregando, children }: { carregando?: boolean; children?: ReactNode }) {
  return (
    <div className="px-5 py-14 text-center text-sm text-bh-cinza">
      {carregando && <Spinner className="mb-3.5" />}
      {children ?? (carregando ? "Carregando…" : null)}
    </div>
  );
}
````
### `src/components/ProtectedRoute.tsx`

````tsx
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
````
### `src/components/AppHeader.tsx`

````tsx
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
````
### `src/components/ModalAlterarSenha.tsx`

````tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invocar } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { REQUISITOS_SENHA, validarForcaSenha } from "@/lib/senha";

/** Modal "🔑 Senha" da tela de revisão. Agora segue a mesma política de senha do backend (antes pedia só 6 caracteres). */
export function ModalAlterarSenha({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { recarregarPerfil } = useAuth();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function limpar() {
    setAtual(""); setNova(""); setConfirma(""); setErro(null); setOk(false);
  }

  async function salvar() {
    setErro(null);
    setOk(false);
    if (!atual || !nova || !confirma) return setErro("Preencha todos os campos.");
    const erroPolitica = validarForcaSenha(nova);
    if (erroPolitica) return setErro(erroPolitica);
    if (nova !== confirma) return setErro("As senhas não coincidem.");
    setSalvando(true);
    try {
      await invocar("alterar-senha", { senha_atual: atual, nova_senha: nova });
      setOk(true);
      await recarregarPerfil();
      setTimeout(() => { limpar(); onFechar(); }, 1500);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) { limpar(); onFechar(); } }}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-base text-bh-azul">Redefinir senha</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Campo id="senha-atual" rotulo="Senha atual" valor={atual} onChange={setAtual} />
          <Campo id="senha-nova" rotulo="Nova senha" valor={nova} onChange={setNova} placeholder="Mínimo 8 caracteres" />
          <ul className="rounded-md bg-gray-50 px-2.5 py-2 text-[11px] leading-relaxed text-bh-cinza">
            {REQUISITOS_SENHA.map((r) => (
              <li key={r.id} className={r.ok(nova) ? "text-bh-verde" : ""}>{r.ok(nova) ? "✓" : "○"} {r.rotulo}</li>
            ))}
          </ul>
          <Campo id="senha-confirma" rotulo="Confirmar nova senha" valor={confirma} onChange={setConfirma} placeholder="Repita a nova senha" />
          {erro && <p className="text-[13px] text-bh-vermelho">{erro}</p>}
          {ok && <p className="text-[13px] text-bh-verde">Senha alterada com sucesso!</p>}
        </div>
        <div className="mt-2 flex justify-end gap-2.5">
          <Button variant="outline" onClick={() => { limpar(); onFechar(); }}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ id, rotulo, valor, onChange, placeholder = "••••••••" }: {
  id: string; rotulo: string; valor: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-xs font-semibold">{rotulo}</Label>
      <Input id={id} type="password" value={valor} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
````
