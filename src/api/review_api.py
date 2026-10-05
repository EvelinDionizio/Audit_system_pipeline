"""
review_api.py — API web Bernhoeft v3.0 com autenticação e banco SQLite.

Como rodar:
    uvicorn src.api.review_api:app --reload --port 8000
"""
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

import logging
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional

# Inicializa banco na startup
from database import init_db
init_db()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Revisão de Auditoria — Bernhoeft", version="3.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"], expose_headers=["*"])

STATIC_DIR = Path(__file__).resolve().parents[2] / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ── Auth helpers ──────────────────────────────────────────────────────────────

def get_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("session_token")


def require_auth(request: Request) -> dict:
    from database import validar_sessao
    token = get_token(request)
    user  = validar_sessao(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    return user


def require_analista(request: Request) -> dict:
    user = require_auth(request)
    if user.get("perfil") != "analista":
        raise HTTPException(status_code=403, detail="Acesso restrito a analistas.")
    return user


# ── Modelos ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    senha: str

class RevisaoRequest(BaseModel):
    evaluation_id: int

class CriarUsuarioRequest(BaseModel):
    nome:   str
    email:  str
    senha:  str
    perfil: str = "auditor"

class AlterarSenhaRequest(BaseModel):
    senha_atual: str
    nova_senha:  str

class FeedbackRequest(BaseModel):
    sugestao_id: int
    aceita:      bool

class ConfigItemRequest(BaseModel):
    checklist_id:   str
    item_nome:      str
    habilitado:     bool
    validacao_tipo: str = "sugestao"
    exige_imagem:   bool = False


# ── Páginas HTML ──────────────────────────────────────────────────────────────

@app.get("/")
def index(request: Request):
    from database import validar_sessao
    token = get_token(request)
    user  = validar_sessao(token) if token else None
    if not user:
        return RedirectResponse("/login")
    p = STATIC_DIR / "index.html"
    return FileResponse(str(p)) if p.exists() else {"status": "ok"}


@app.get("/login")
def login_page():
    p = STATIC_DIR / "login.html"
    return FileResponse(str(p)) if p.exists() else {"status": "login page"}


@app.get("/analista")
def analista_page(request: Request):
    user = require_analista(request)
    p = STATIC_DIR / "analista.html"
    return FileResponse(str(p)) if p.exists() else {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/api/login")
def login(req: LoginRequest, response: Response):
    from database import buscar_usuario_por_email, verificar_senha, criar_sessao, dias_ate_expirar_senha
    user = buscar_usuario_por_email(req.email)
    if not user or not verificar_senha(req.senha, user["senha_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    token = criar_sessao(user["id"])
    response.set_cookie(
        "session_token", token,
        httponly=True, samesite="lax",
        secure=False, max_age=28800, path="/"
    )
    # Verifica expiração de senha — política de 90 dias
    dias_restantes = dias_ate_expirar_senha(user["id"], 90)
    return {
        "token":            token,
        "perfil":           user["perfil"],
        "nome":             user["nome"],
        "email":            user["email"],
        "senha_expirada":   dias_restantes < 0,
        "dias_ate_expirar": dias_restantes,
    }


@app.post("/api/logout")
def logout(request: Request, response: Response):
    from database import invalidar_sessao
    token = get_token(request)
    if token:
        invalidar_sessao(token)
    response.delete_cookie("session_token")
    return {"status": "ok"}


@app.get("/api/me")
def me(request: Request):
    user = require_auth(request)
    return {"id": user["id"], "nome": user["nome"], "email": user["email"], "perfil": user["perfil"]}


@app.post("/api/alterar-senha")
def alterar_senha(req: AlterarSenhaRequest, request: Request):
    from database import verificar_senha, alterar_senha as db_alterar, validar_forca_senha
    user = require_auth(request)
    if not verificar_senha(req.senha_atual, user["senha_hash"]):
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")
    erro = validar_forca_senha(req.nova_senha)
    if erro:
        raise HTTPException(status_code=400, detail=erro)
    if req.nova_senha == req.senha_atual:
        raise HTTPException(status_code=400, detail="A nova senha não pode ser igual à senha atual.")
    db_alterar(user["id"], req.nova_senha)
    return {"status": "Senha alterada com sucesso."}


# ── Revisão (auditor) ─────────────────────────────────────────────────────────

@app.post("/api/revisar")
def revisar(req: RevisaoRequest, request: Request):
    from services.polling_service import fetch_and_structure
    from services.parecer_service import gerar_parecer
    from database import registrar_auditoria_v2 as registrar_auditoria, registrar_sugestoes

    user = require_auth(request)
    logger.info(f"Revisão por {user['nome']} (id={user['id']}): evaluation_id={req.evaluation_id}")

    try:
        payload = fetch_and_structure(req.evaluation_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Erro ao buscar avaliação {req.evaluation_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar avaliação na API do Checklist Fácil.")

    cabecalho = payload.get("cabecalho", {})
    resumo    = payload.get("resumo", {})

    try:
        resultado = gerar_parecer(payload)
    except Exception as e:
        logger.error(f"Erro IA avaliação {req.evaluation_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao processar com IA.")

    # Persiste no banco
    try:
        audit_id = registrar_auditoria(req.evaluation_id, user["id"], cabecalho, resumo)
        registrar_sugestoes(audit_id, resultado.get("itens", []))
    except Exception as e:
        logger.warning(f"Erro ao persistir auditoria {req.evaluation_id}: {e}")

    return {
        "evaluation_id": req.evaluation_id,
        "checklist":     cabecalho.get("checklist_nome", ""),
        "unidade":       cabecalho.get("unidade_nome", ""),
        "auditor":       cabecalho.get("auditor_nome", ""),
        "data_inicio":   cabecalho.get("data_inicio", ""),
        "resumo": {
            "status":                  cabecalho.get("status"),
            "respondidos":             resumo.get("total_itens_relevantes", 0),
            "nao_conformes":           resumo.get("total_nao_conformes", 0),
            "parciais":                resumo.get("total_parciais", 0),
            "conformes":               resumo.get("total_conformes", 0),
            "percentual_conformidade": resumo.get("percentual_conformidade"),
            "nivel_conformidade":      resumo.get("nivel_conformidade", "sem_dados"),
        },
        "sugestoes": resultado,
    }


@app.post("/api/feedback")
def feedback(req: FeedbackRequest, request: Request):
    from database import registrar_feedback_sugestao
    require_auth(request)
    registrar_feedback_sugestao(req.sugestao_id, req.aceita)
    return {"status": "ok"}


# ── Painel analista ───────────────────────────────────────────────────────────

@app.get("/api/auditorias")
def listar_auditorias(request: Request, limit: int = 20, status: str = "2,3", de: str = "", ate: str = "", dias: int = 0):
    """
    Painel do analista — baseado exclusivamente no banco local.
    Mostra apenas auditorias já revisadas pelo sistema.
    Filtros de status, data e quantidade aplicados ao histórico persistido.
    """
    require_analista(request)
    from database import historico_auditorias
    from datetime import timedelta

    status_list = [int(s.strip()) for s in str(status).split(",") if s.strip().isdigit()]

    # ── Busca histórico completo do banco ─────────────────────────────────────
    historico = historico_auditorias(limit=500)

    resultado = []
    for h in historico:
        eid = h.get("evaluation_id")
        if not eid:
            continue

        # Filtro de status — aceita None (registros sem status_cf no banco antigo)
        status_h = h.get("status_cf")
        if status_list and status_h is not None and status_h not in status_list:
            continue

        # Filtro de data
        data_h = (h.get("data_inicio") or "")[:10]
        if de and data_h and data_h < de:
            continue
        if ate and data_h and data_h > ate:
            continue
        if dias > 0 and not de and not ate:
            cutoff = (datetime.utcnow() - timedelta(days=dias)).date().isoformat()
            if data_h and data_h < cutoff:
                continue

        resultado.append({
            "evaluation_id":           eid,
            "checklist":               h.get("checklist") or "—",
            "unidade":                 h.get("unidade") or "—",
            "auditor":                 h.get("auditor_cf") or "—",
            "data_inicio":             h.get("data_inicio") or "",
            "status":                  status_h,
            "percentual_conformidade": h.get("percentual_conformidade"),
            "nivel_conformidade":      h.get("nivel_conformidade") or "sem_dados",
            "total_itens":             h.get("total_itens") or 0,
            "nao_conformes":           h.get("total_nc") or 0,
            "parciais":                h.get("total_parciais") or 0,
            "total_reprocessamentos":  h.get("total_reprocessamentos") or 0,
            "fonte":                   "banco",
        })

    # Ordena por data desc e aplica limit
    resultado = sorted(resultado, key=lambda x: x.get("data_inicio") or "", reverse=True)[:limit]

    # ── Estatísticas ──────────────────────────────────────────────────────────
    com_score     = [r for r in resultado if r["percentual_conformidade"] is not None]
    media_geral   = round(sum(r["percentual_conformidade"] for r in com_score) / len(com_score), 1) if com_score else None
    por_auditor   = {}
    por_checklist = {}
    for r in com_score:
        if r["auditor"] != "—":
            por_auditor.setdefault(r["auditor"], []).append(r["percentual_conformidade"])
        if r["checklist"] != "—":
            por_checklist.setdefault(r["checklist"], []).append(r["percentual_conformidade"])

    return {
        "auditorias":          resultado,
        "total":               len(resultado),
        "media_geral":         media_geral,
        "media_por_auditor":   {a: round(sum(v)/len(v),1) for a,v in por_auditor.items()},
        "media_por_checklist": {c: round(sum(v)/len(v),1) for c,v in por_checklist.items()},
    }


@app.get("/api/historico")
def historico(request: Request, limit: int = 50, dias: int = 0):
    require_analista(request)
    from database import historico_auditorias
    rows = historico_auditorias(limit)
    if dias > 0:
        from datetime import timedelta
        cutoff = (datetime.utcnow() - timedelta(days=dias)).isoformat()
        rows = [r for r in rows if (r.get("processado_em") or "") >= cutoff]
    return {"historico": rows, "total": len(rows)}


@app.get("/api/reprocessamentos/{evaluation_id}")
def reprocessamentos(evaluation_id: int, request: Request):
    require_analista(request)
    from database import historico_reprocessamentos
    return {
        "evaluation_id": evaluation_id,
        "historico": historico_reprocessamentos(evaluation_id)
    }


@app.get("/api/score-auditores")
def score_auditores(request: Request):
    require_analista(request)
    from database import score_auditores as db_score
    return {"auditores": db_score()}


@app.get("/api/uso-tokens")
def uso_tokens(request: Request, dias: int = 30):
    require_analista(request)
    from database import resumo_uso_tokens, uso_tokens_por_dia
    return {
        "resumo":  resumo_uso_tokens(dias),
        "por_dia": uso_tokens_por_dia(dias),
        "dias":    dias,
    }


# ── Gestão de usuários (analista) ─────────────────────────────────────────────

@app.get("/api/usuarios")
def listar_usuarios(request: Request):
    require_analista(request)
    from database import listar_usuarios as db_listar
    return {"usuarios": db_listar()}


@app.post("/api/usuarios")
def criar_usuario(req: CriarUsuarioRequest, request: Request):
    require_analista(request)
    from database import criar_usuario as db_criar, buscar_usuario_por_email
    if buscar_usuario_por_email(req.email):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado.")
    user = db_criar(req.nome, req.email, req.senha, req.perfil)
    return {"id": user["id"], "nome": user["nome"], "email": user["email"], "perfil": user["perfil"]}


@app.patch("/api/usuarios/{uid}")
def atualizar_usuario(uid: int, dados: dict, request: Request):
    require_analista(request)
    from database import atualizar_usuario as db_atualizar
    db_atualizar(uid, **dados)
    return {"status": "ok"}

@app.delete("/api/usuarios/{uid}")
def deletar_usuario(uid: int, request: Request):
    require_analista(request)
    user = require_auth(request)
    if user["id"] == uid:
        raise HTTPException(status_code=400, detail="Você não pode excluir sua própria conta.")
    from database import excluir_usuario
    try:
        excluir_usuario(uid)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/api/usuarios/{uid}/perfil")
def alterar_perfil_usuario(uid: int, dados: dict, request: Request):
    require_analista(request)
    user = require_auth(request)
    novo_perfil = dados.get("perfil")
    if not novo_perfil:
        raise HTTPException(status_code=400, detail="Campo 'perfil' obrigatório.")
    if user["id"] == uid and novo_perfil == "auditor":
        raise HTTPException(status_code=400, detail="Você não pode rebaixar sua própria conta.")
    from database import alterar_perfil
    try:
        alterar_perfil(uid, novo_perfil)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Configuração de itens ─────────────────────────────────────────────────────

@app.get("/api/config-itens")
def config_itens(request: Request, checklist_id: str = None):
    require_analista(request)
    from database import listar_config_itens
    return {"itens": listar_config_itens(checklist_id)}


@app.post("/api/config-itens")
def salvar_config_item(req: ConfigItemRequest, request: Request):
    user = require_analista(request)
    from database import upsert_config_item
    upsert_config_item(req.checklist_id, req.item_nome, req.habilitado,
                       req.validacao_tipo, req.exige_imagem, user["id"])
    return {"status": "ok"}