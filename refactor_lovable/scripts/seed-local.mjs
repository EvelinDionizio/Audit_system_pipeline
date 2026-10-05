// Cria os usuários de teste do ambiente local que ainda não existem.
// Chamado por scripts/local.sh, que exporta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
// do Supabase local. Nunca rodar contra o Supabase de produção.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não definidos.");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  throw new Error(`Recusado: ${url} não é o Supabase local.`);
}

const SENHA = "Teste@12345";
const USUARIOS = [
  { email: "analista@teste.local", nome: "Analista Teste", perfil: "analista" },
  { email: "auditor@teste.local", nome: "Auditor Teste", perfil: "auditor" },
];

const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

// Pré-cadastro primeiro: o trigger do 1º login aplica o papel na criação do usuário.
const { error } = await admin.from("usuarios_autorizados").upsert(USUARIOS, { onConflict: "email" });
if (error) throw new Error(`usuarios_autorizados: ${error.message}`);

const { data: lista, error: erroLista } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (erroLista) throw erroLista;

for (const u of USUARIOS) {
  // Usuário existente fica como está: trocar a senha revogaria as sessões abertas.
  if (lista.users.some((x) => x.email === u.email)) {
    console.log(`  ✓ ${u.email} (${u.perfil}) — já existe`);
    continue;
  }
  const { error: erroUsuario } = await admin.auth.admin.createUser({
    email: u.email,
    password: SENHA,
    email_confirm: true,
    user_metadata: { full_name: u.nome },
  });
  if (erroUsuario) throw new Error(`${u.email}: ${erroUsuario.message}`);
  console.log(`  ✓ ${u.email} (${u.perfil}) — criado, senha ${SENHA}`);
}
