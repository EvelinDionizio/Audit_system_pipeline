Parte 5 de 11 — frontend. Crie os 6 arquivos abaixo com exatamente este conteúdo. Não corrija erros de build ainda; responda apenas "Parte 5 recebida" com a lista de arquivos.

### `tailwind.config.ts`

````ts
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Config padrão do template Lovable (shadcn/ui) + paleta Bernhoeft (`bh-*`),
// que reproduz as variáveis CSS das páginas HTML originais (--azul, --verde, ...).
export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        bh: {
          azul: "#1a3a6b",
          "azul-md": "#2d5aa0",
          "azul-lt": "#e8eef8",
          verde: "#059669",
          "verde-lt": "#ecfdf5",
          amarelo: "#d97706",
          "amarelo-lt": "#fffbeb",
          vermelho: "#dc2626",
          "vermelho-lt": "#fef2f2",
          cinza: "#6b7280",
          "cinza-lt": "#f3f4f6",
          borda: "#e5e7eb",
          texto: "#111827",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
````
### `src/index.css`

````css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Tema shadcn/ui ajustado à identidade das páginas originais:
   primary = azul Bernhoeft (#1a3a6b), fonte do sistema. */
@layer base {
  :root {
    --background: 210 40% 96%;
    --foreground: 221 39% 11%;
    --card: 0 0% 100%;
    --card-foreground: 221 39% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 221 39% 11%;
    --primary: 216 61% 26%;
    --primary-foreground: 0 0% 100%;
    --secondary: 220 14% 96%;
    --secondary-foreground: 216 61% 26%;
    --muted: 220 14% 96%;
    --muted-foreground: 220 9% 46%;
    --accent: 218 56% 94%;
    --accent-foreground: 216 61% 26%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 216 56% 40%;
    --radius: 0.625rem;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
}
````
### `src/lib/types.ts`

````ts
export type Perfil = "auditor" | "analista";
export type Nivel = "excelente" | "bom" | "regular" | "critico" | "sem_dados";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  senha_alterada_em: string;
  ultimo_acesso?: string | null;
}

// ── Resposta de /revisar ────────────────────────────────────────────────────
export interface ItemSugestao {
  item_id: number | null;
  categoria: string;
  pergunta: string;
  criticidade: string;
  obrigatorio: boolean;
  resposta_original: string;
  sugestao: string | null;
  texto_campo: string | null;
  justificativa: string | null;
  sugestao_id: number | null;
  regra_tipo: "obrigatorio" | "sugestao" | null;
  ia_desabilitada: boolean;
  exige_imagem: boolean;
  total_anexos: number;
}

export interface ResultadoRevisao {
  evaluation_id: number;
  checklist: string;
  unidade: string;
  auditor: string;
  data_inicio: string;
  resumo: {
    status: number | null;
    respondidos: number;
    nao_conformes: number;
    parciais: number;
    conformes: number;
    percentual_conformidade: number | null;
    nivel_conformidade: Nivel;
  };
  sugestoes: { itens: ItemSugestao[]; parecer: string };
}

// ── Tabelas ────────────────────────────────────────────────────────────────
export interface AuditoriaRow {
  id: number;
  evaluation_id: number;
  checklist: string | null;
  unidade: string | null;
  auditor_cf: string | null;
  data_inicio: string | null;
  status_cf: number | null;
  percentual_conformidade: number | null;
  nivel_conformidade: Nivel | null;
  total_itens: number;
  total_nc: number;
  total_parciais: number;
  total_reprocessamentos: number;
  processado_em: string;
}

export interface ReprocessamentoRow {
  id: number;
  processado_em: string;
  percentual_conformidade: number | null;
  nivel_conformidade: Nivel | null;
  total_nc: number;
  profiles: { nome: string } | null;
}

export interface ScoreAuditor {
  auditor: string;
  total_auditorias: number;
  media_score: number | null;
  total_nc: number;
  total_sugestoes: number;
  sugestoes_aceitas: number;
  sugestoes_ignoradas: number;
  taxa_aceitacao: number | null;
}

export interface ConfigItem {
  id: number;
  checklist_id: string;
  item_nome: string;
  habilitado: boolean;
  validacao_tipo: "obrigatorio" | "sugestao";
  exige_imagem: boolean;
}

export interface UsuarioInativo {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  ultimo_acesso: string | null;
  dias_inativo: number;
}

// ── Payload completo (coluna auditorias.payload) — usado no Excel ─────────
export interface PayloadItem {
  id: number | null;
  categoria: string;
  pergunta: string;
  tipo_resposta: "texto" | "avaliativo";
  resposta_codigo: number | null;
  resposta_texto: string | null;
  comentario: string | null;
  nao_conforme: boolean;
  parcial: boolean;
  parecer?: string | null;
}

export interface Payload {
  cabecalho: {
    id: number;
    checklist_nome: string | null;
    unidade_nome: string | null;
    auditor_nome: string | null;
    departamento: string[];
    data_inicio: string | null;
    data_conclusao: string | null;
  };
  itens: PayloadItem[];
  resumo: {
    total_itens_relevantes: number;
    total_nao_conformes: number;
    total_parciais: number;
    requer_rag: boolean;
    total_com_parecer?: number;
  };
}
````
### `src/lib/api.ts`

````ts
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Chama uma edge function. Erros chegam como `{ detail }` (mesmo formato da API FastAPI original).
 * 401 → encerra a sessão e volta ao login, como o override de fetch das páginas HTML.
 */
export async function invocar<T>(nome: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body: body ?? {} });
  if (!error) return data as T;

  let status = 0;
  let detail = "Erro na requisição.";
  if (error instanceof FunctionsHttpError) {
    status = error.context.status;
    try {
      const corpo = await error.context.json();
      if (corpo?.detail) detail = corpo.detail;
    } catch {
      /* corpo não-JSON */
    }
  } else if (error instanceof FunctionsFetchError) {
    detail = "Não foi possível conectar ao servidor.";
  }
  if (status === 401) {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }
  throw new ApiError(status, detail);
}

/** Desembrulha respostas do PostgREST lançando erro legível. */
export function exigir<T>(resp: { data: T | null; error: { message: string } | null }): T {
  if (resp.error) throw new Error(resp.error.message);
  return resp.data as T;
}
````
### `src/lib/senha.ts`

````ts
// Política de senha corporativa. Mantenha em sincronia com supabase/functions/_shared/senha.ts.

export const VALIDADE_SENHA_DIAS = 90;

export const REQUISITOS_SENHA = [
  { id: "len", rotulo: "Mínimo 8 caracteres", ok: (s: string) => s.length >= 8 },
  { id: "mai", rotulo: "Pelo menos uma letra maiúscula", ok: (s: string) => /[A-Z]/.test(s) },
  { id: "min", rotulo: "Pelo menos uma letra minúscula", ok: (s: string) => /[a-z]/.test(s) },
  { id: "num", rotulo: "Pelo menos um número", ok: (s: string) => /[0-9]/.test(s) },
];

export function validarForcaSenha(senha: string): string | null {
  if (senha.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (!/[A-Z]/.test(senha)) return "A senha deve conter pelo menos uma letra maiúscula.";
  if (!/[a-z]/.test(senha)) return "A senha deve conter pelo menos uma letra minúscula.";
  if (!/[0-9]/.test(senha)) return "A senha deve conter pelo menos um número.";
  return null;
}

export function diasAteExpirarSenha(alteradaEm: string | null | undefined, validade = VALIDADE_SENHA_DIAS): number {
  if (!alteradaEm) return 0;
  const alterada = new Date(alteradaEm);
  if (Number.isNaN(alterada.getTime())) return validade;
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((dia(alterada) + validade * 86_400_000 - dia(new Date())) / 86_400_000);
}
````
### `src/lib/format.ts`

````ts
import type { Nivel } from "./types";

export const STATUS_LABELS: Record<number, string> = {
  2: "Em Andamento",
  3: "Em Análise",
  4: "Reprovado",
  5: "Reaberto",
  6: "Concluído",
};

export function nivelDoScore(pct: number): Exclude<Nivel, "sem_dados"> {
  return pct >= 90 ? "excelente" : pct >= 75 ? "bom" : pct >= 60 ? "regular" : "critico";
}

/** Classes Tailwind por nível de conformidade (círculo, badge e barra). */
export const NIVEL_CLASSES: Record<Nivel, { borda: string; texto: string; badge: string; barra: string }> = {
  excelente: { borda: "border-bh-verde", texto: "text-bh-verde", badge: "bg-bh-verde-lt text-bh-verde", barra: "bg-bh-verde" },
  bom: { borda: "border-blue-500", texto: "text-blue-500", badge: "bg-blue-100 text-blue-800", barra: "bg-blue-500" },
  regular: { borda: "border-bh-amarelo", texto: "text-bh-amarelo", badge: "bg-bh-amarelo-lt text-bh-amarelo", barra: "bg-bh-amarelo" },
  critico: { borda: "border-bh-vermelho", texto: "text-bh-vermelho", badge: "bg-bh-vermelho-lt text-bh-vermelho", barra: "bg-bh-vermelho" },
  sem_dados: { borda: "border-bh-cinza", texto: "text-bh-cinza", badge: "bg-bh-cinza-lt text-bh-cinza", barra: "bg-bh-cinza" },
};

export function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Number(v)}%`;
}

export function fmtDataBR(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

/** Remove marcação markdown do texto do Claude (porta de limparMarkdown das páginas originais). */
export function limparMarkdown(txt: string | null | undefined): string {
  if (!txt) return "";
  return txt
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/---\s*/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/ {3,}/g, "")
    .trim();
}

/**
 * Extrai uma seção do parecer (ex.: "Criticidade") — porta de _extrair_secao() do export_excel.py.
 * Retorna o início do parecer quando a seção não é encontrada.
 */
export function extrairSecao(parecer: string | null | undefined, secao: string): string {
  if (!parecer) return "—";
  const resultado: string[] = [];
  let capturando = false;
  const alvo = secao.toLowerCase();
  for (const linha of parecer.split("\n")) {
    const limpa = linha.trim().replace(/^[#*]+/, "").trim();
    if (!capturando && limpa.toLowerCase().includes(alvo) && (linha.includes("**") || limpa.startsWith(secao) || /^\d+\./.test(limpa))) {
      capturando = true;
      const idx = limpa.indexOf(":");
      if (idx >= 0) {
        const resto = limpa.slice(idx + 1).replace(/\*\*/g, "").trim();
        if (resto) resultado.push(resto);
      }
      continue;
    }
    if (capturando) {
      if (limpa && /Constatação|Fundamentação|Recomendação|Texto para|\*\*/.test(limpa) && linha.trim() !== limpa) break;
      if (limpa) resultado.push(limpa.replace(/\*\*/g, ""));
    }
  }
  return resultado.join(" ").trim() || parecer.slice(0, 300);
}
````
