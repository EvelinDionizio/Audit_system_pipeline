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
