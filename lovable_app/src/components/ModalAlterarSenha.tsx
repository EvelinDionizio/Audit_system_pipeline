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
