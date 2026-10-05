import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { entrarComoDemo, usuariosParaLoginDemo } from "@/lib/demo/cliente-demo.server";
import { modoDemo } from "@/lib/demo/modo.server";

/**
 * Login fictício do modo demonstração. As duas funções só respondem com
 * MODO_DEMO=true; fora dele falham, então não abrem acesso em produção.
 */

function exigirModoDemo() {
  if (!modoDemo()) throw new Error("Disponível apenas no modo demonstração.");
}

export const listarUsuariosDemo = createServerFn({ method: "GET" }).handler(() => {
  exigirModoDemo();
  return usuariosParaLoginDemo();
});

export const usuariosDemoQuery = () =>
  queryOptions({ queryKey: ["demo", "usuarios"], queryFn: () => listarUsuariosDemo() });

export const entrarDemo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(({ data }) => {
    exigirModoDemo();
    return { profileId: entrarComoDemo(data.email) };
  });
