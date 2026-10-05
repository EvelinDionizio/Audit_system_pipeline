import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 text-bh-texto">
      <h1 className="text-2xl font-bold text-bh-azul">Página não encontrada</h1>
      <Link to="/" className="text-sm text-bh-azul-md underline">Voltar para a revisão</Link>
    </div>
  );
}
