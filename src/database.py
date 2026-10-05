"""
database.py — Banco SQLite para o sistema de auditoria Bernhoeft.

Cria e migra o banco automaticamente na primeira execução.
Localização: data/bernhoeft.db (relativo à raiz do projeto)
"""
import sqlite3
import hashlib
import secrets
import os
from pathlib import Path
from datetime import datetime, timedelta

# Localização do banco — pasta data/ na raiz do projeto
DB_PATH = Path(__file__).resolve().parents[2] / "data" / "bernhoeft.db"


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Cria todas as tabelas se não existirem. Seguro para rodar múltiplas vezes."""
    conn = get_conn()
    cur  = conn.cursor()

    # ── Usuários ──────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            nome          TEXT    NOT NULL,
            email         TEXT    NOT NULL UNIQUE,
            senha_hash    TEXT    NOT NULL,
            perfil        TEXT    NOT NULL DEFAULT 'auditor',
            ativo         INTEGER NOT NULL DEFAULT 1,
            criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
            ultimo_acesso TEXT,
            senha_alterada_em TEXT DEFAULT (datetime('now'))
        )
    """)

    # ── Sessões ───────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessoes (
            token       TEXT    PRIMARY KEY,
            usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
            criado_em   TEXT    NOT NULL DEFAULT (datetime('now')),
            expira_em   TEXT    NOT NULL,
            ativo       INTEGER NOT NULL DEFAULT 1
        )
    """)

    # ── Histórico de auditorias processadas ──────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS auditorias (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            evaluation_id           INTEGER NOT NULL UNIQUE,
            usuario_id              INTEGER REFERENCES usuarios(id),
            checklist               TEXT,
            unidade                 TEXT,
            auditor_cf              TEXT,
            data_inicio             TEXT,
            status_cf               INTEGER,
            percentual_conformidade REAL,
            nivel_conformidade      TEXT,
            total_itens             INTEGER DEFAULT 0,
            total_nc                INTEGER DEFAULT 0,
            total_parciais          INTEGER DEFAULT 0,
            total_conformes         INTEGER DEFAULT 0,
            total_reprocessamentos  INTEGER DEFAULT 0,
            processado_em           TEXT    NOT NULL DEFAULT (datetime('now')),
            atualizado_em           TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── Histórico de reprocessamentos (cada versão preservada) ───────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS reprocessamentos (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            evaluation_id           INTEGER NOT NULL,
            usuario_id              INTEGER REFERENCES usuarios(id),
            percentual_conformidade REAL,
            nivel_conformidade      TEXT,
            total_itens             INTEGER DEFAULT 0,
            total_nc                INTEGER DEFAULT 0,
            processado_em           TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── Sugestões geradas pela IA por item ───────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sugestoes (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            auditoria_id    INTEGER NOT NULL REFERENCES auditorias(id),
            item_id         INTEGER,
            categoria       TEXT,
            pergunta        TEXT,
            criticidade     TEXT,
            resposta_original TEXT,
            sugestao_ia     TEXT,
            tipo            TEXT DEFAULT 'sugestao',  -- 'obrigatorio' | 'sugestao'
            aceita          INTEGER,                  -- NULL=pendente, 1=aceita, 0=ignorada
            aceita_em       TEXT
        )
    """)

    # ── Configurações de itens (habilitar/desabilitar) ────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS config_itens (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            checklist_id    TEXT,
            item_nome       TEXT    NOT NULL,
            habilitado      INTEGER NOT NULL DEFAULT 1,
            validacao_tipo  TEXT    DEFAULT 'sugestao',  -- 'obrigatorio' | 'sugestao'
            exige_imagem    INTEGER NOT NULL DEFAULT 0,
            criado_por      INTEGER REFERENCES usuarios(id),
            atualizado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── Recuperação de senha ──────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS recuperacao_senha (
            token       TEXT    PRIMARY KEY,
            usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
            criado_em   TEXT    NOT NULL DEFAULT (datetime('now')),
            expira_em   TEXT    NOT NULL,
            usado       INTEGER NOT NULL DEFAULT 0
        )
    """)

    # ── Uso de tokens por chamada à API do Claude ─────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS uso_tokens (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            evaluation_id   INTEGER,
            usuario_id      INTEGER REFERENCES usuarios(id),
            modelo          TEXT,
            tipo_chamada    TEXT,
            tokens_input    INTEGER DEFAULT 0,
            tokens_output   INTEGER DEFAULT 0,
            tokens_total    INTEGER DEFAULT 0,
            custo_usd       REAL,
            criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Migração segura — adiciona colunas/tabelas novas sem apagar dados
    migrations = [
        "ALTER TABLE auditorias ADD COLUMN total_reprocessamentos INTEGER DEFAULT 0",
        "ALTER TABLE auditorias ADD COLUMN atualizado_em TEXT",
        "CREATE TABLE IF NOT EXISTS reprocessamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, evaluation_id INTEGER NOT NULL, usuario_id INTEGER REFERENCES usuarios(id), percentual_conformidade REAL, nivel_conformidade TEXT, total_itens INTEGER DEFAULT 0, total_nc INTEGER DEFAULT 0, processado_em TEXT NOT NULL DEFAULT (datetime('now')))",
        "CREATE TABLE IF NOT EXISTS uso_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, evaluation_id INTEGER, usuario_id INTEGER, modelo TEXT, tipo_chamada TEXT, tokens_input INTEGER DEFAULT 0, tokens_output INTEGER DEFAULT 0, tokens_total INTEGER DEFAULT 0, custo_usd REAL, criado_em TEXT NOT NULL DEFAULT (datetime('now')))",
        "ALTER TABLE usuarios ADD COLUMN senha_alterada_em TEXT DEFAULT (datetime('now'))",
    ]
    for sql in migrations:
        try:
            cur.execute(sql)
        except Exception:
            pass  # coluna/tabela já existe

    conn.commit()
    conn.close()

    _seed_admin()
    print(f"[Database] Banco inicializado: {DB_PATH}")


def _seed_admin():
    """Cria usuário admin padrão se não existir nenhum analista."""
    conn = get_conn()
    existe = conn.execute("SELECT 1 FROM usuarios WHERE perfil='analista' LIMIT 1").fetchone()
    if not existe:
        senha_hash = hash_senha("admin123")
        conn.execute("""
            INSERT INTO usuarios (nome, email, senha_hash, perfil)
            VALUES (?, ?, ?, ?)
        """, ("Administrador", "admin@bernhoeft.com.br", senha_hash, "analista"))
        conn.commit()
        print("[Database] Usuário admin criado: admin@bernhoeft.com.br / admin123")
        print("[Database] ⚠ ALTERE A SENHA DO ADMIN NO PRIMEIRO ACESSO.")
    conn.close()


# ── Senhas ────────────────────────────────────────────────────────────────────

def hash_senha(senha: str) -> str:
    salt = secrets.token_hex(16)
    h    = hashlib.sha256(f"{salt}{senha}".encode()).hexdigest()
    return f"{salt}:{h}"


def verificar_senha(senha: str, hash_armazenado: str) -> bool:
    try:
        salt, h = hash_armazenado.split(":", 1)
        return hashlib.sha256(f"{salt}{senha}".encode()).hexdigest() == h
    except Exception:
        return False


# ── Usuários ──────────────────────────────────────────────────────────────────

def buscar_usuario_por_email(email: str) -> dict | None:
    conn = get_conn()
    row  = conn.execute("SELECT * FROM usuarios WHERE email=? AND ativo=1", (email,)).fetchone()
    conn.close()
    return dict(row) if row else None


def buscar_usuario_por_id(uid: int) -> dict | None:
    conn = get_conn()
    row  = conn.execute("SELECT * FROM usuarios WHERE id=?", (uid,)).fetchone()
    conn.close()
    return dict(row) if row else None


def criar_usuario(nome: str, email: str, senha: str, perfil: str = "auditor") -> dict:
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?,?,?,?)",
            (nome, email, hash_senha(senha), perfil)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM usuarios WHERE email=?", (email,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def listar_usuarios() -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT id, nome, email, perfil, ativo, criado_em, ultimo_acesso FROM usuarios ORDER BY nome").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def atualizar_usuario(uid: int, **kwargs):
    campos_permitidos = {"nome", "email", "perfil", "ativo"}
    updates = {k: v for k, v in kwargs.items() if k in campos_permitidos}
    if not updates:
        return
    conn = get_conn()
    sets = ", ".join(f"{k}=?" for k in updates)
    conn.execute(f"UPDATE usuarios SET {sets} WHERE id=?", (*updates.values(), uid))
    conn.commit()
    conn.close()


def validar_forca_senha(senha: str) -> str | None:
    """
    Valida a política de senha corporativa.
    Retorna None se válida, ou mensagem de erro se inválida.
    Política: mínimo 8 caracteres, maiúscula, minúscula e número.
    """
    if len(senha) < 8:
        return "A senha deve ter pelo menos 8 caracteres."
    if not any(c.isupper() for c in senha):
        return "A senha deve conter pelo menos uma letra maiúscula."
    if not any(c.islower() for c in senha):
        return "A senha deve conter pelo menos uma letra minúscula."
    if not any(c.isdigit() for c in senha):
        return "A senha deve conter pelo menos um número."
    return None


def dias_ate_expirar_senha(uid: int, dias_validade: int = 90) -> int:
    """
    Retorna quantos dias faltam para a senha expirar.
    Valor negativo significa que já expirou.
    """
    conn = get_conn()
    row = conn.execute(
        "SELECT senha_alterada_em FROM usuarios WHERE id=?", (uid,)
    ).fetchone()
    conn.close()
    if not row or not row["senha_alterada_em"]:
        return 0
    from datetime import date
    try:
        alterada = datetime.fromisoformat(row["senha_alterada_em"]).date()
        expira   = alterada + timedelta(days=dias_validade)
        return (expira - date.today()).days
    except Exception:
        return dias_validade


def senha_expirada(uid: int, dias_validade: int = 90) -> bool:
    """Retorna True se a senha do usuário expirou."""
    return dias_ate_expirar_senha(uid, dias_validade) < 0


def alterar_senha(uid: int, nova_senha: str):
    conn = get_conn()
    conn.execute(
        "UPDATE usuarios SET senha_hash=?, senha_alterada_em=datetime('now') WHERE id=?",
        (hash_senha(nova_senha), uid)
    )
    conn.commit()
    conn.close()




# ── Sessões ───────────────────────────────────────────────────────────────────

def criar_sessao(usuario_id: int, horas: int = 8) -> str:
    from datetime import timedelta
    token     = secrets.token_urlsafe(32)
    expira_em = (datetime.utcnow() + timedelta(hours=horas)).isoformat()
    conn = get_conn()
    # Invalida sessões antigas do mesmo usuário
    conn.execute("UPDATE sessoes SET ativo=0 WHERE usuario_id=?", (usuario_id,))
    conn.execute(
        "INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?,?,?)",
        (token, usuario_id, expira_em)
    )
    # Atualiza último acesso
    conn.execute("UPDATE usuarios SET ultimo_acesso=? WHERE id=?",
                 (datetime.utcnow().isoformat(), usuario_id))
    conn.commit()
    conn.close()
    return token


def validar_sessao(token: str) -> dict | None:
    """Retorna o usuário se o token for válido e não expirado."""
    if not token:
        return None
    conn = get_conn()
    row  = conn.execute("""
        SELECT u.* FROM sessoes s
        JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token=? AND s.ativo=1 AND s.expira_em > datetime('now')
    """, (token,)).fetchone()
    conn.close()
    return dict(row) if row else None


def invalidar_sessao(token: str):
    conn = get_conn()
    conn.execute("UPDATE sessoes SET ativo=0 WHERE token=?", (token,))
    conn.commit()
    conn.close()


# ── Histórico de auditorias ───────────────────────────────────────────────────

def registrar_auditoria(evaluation_id: int, usuario_id: int | None, cabecalho: dict, resumo: dict) -> int:
    conn = get_conn()
    cur  = conn.execute("""
        INSERT INTO auditorias
            (evaluation_id, usuario_id, checklist, unidade, auditor_cf,
             data_inicio, status_cf, percentual_conformidade, nivel_conformidade,
             total_itens, total_nc, total_parciais, total_conformes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        evaluation_id,
        usuario_id,
        cabecalho.get("checklist_nome"),
        cabecalho.get("unidade_nome"),
        cabecalho.get("auditor_nome"),
        cabecalho.get("data_inicio"),
        cabecalho.get("status"),
        resumo.get("percentual_conformidade"),
        resumo.get("nivel_conformidade"),
        resumo.get("total_itens_relevantes", 0),
        resumo.get("total_nao_conformes", 0),
        resumo.get("total_parciais", 0),
        resumo.get("total_conformes", 0),
    ))
    conn.commit()
    auditoria_id = cur.lastrowid
    conn.close()
    return auditoria_id


def registrar_sugestoes(auditoria_id: int, itens: list[dict]):
    conn = get_conn()
    for item in itens:
        tipo = "obrigatorio" if item.get("criticidade") == "Mandatório" and item.get("sugestao") else "sugestao"
        conn.execute("""
            INSERT INTO sugestoes
                (auditoria_id, item_id, categoria, pergunta, criticidade,
                 resposta_original, sugestao_ia, tipo)
            VALUES (?,?,?,?,?,?,?,?)
        """, (
            auditoria_id,
            item.get("item_id"),
            item.get("categoria"),
            item.get("pergunta"),
            item.get("criticidade"),
            item.get("resposta_original"),
            item.get("sugestao"),
            tipo,
        ))
    conn.commit()
    conn.close()


def registrar_feedback_sugestao(sugestao_id: int, aceita: bool):
    conn = get_conn()
    conn.execute(
        "UPDATE sugestoes SET aceita=?, aceita_em=datetime('now') WHERE id=?",
        (1 if aceita else 0, sugestao_id)
    )
    conn.commit()
    conn.close()


def historico_auditorias(limit: int = 50) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("""
        SELECT a.*, u.nome as usuario_nome
        FROM auditorias a
        LEFT JOIN usuarios u ON u.id = a.usuario_id
        ORDER BY a.processado_em DESC LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Score do auditor ──────────────────────────────────────────────────────────

def score_auditores() -> list[dict]:
    conn = get_conn()
    rows = conn.execute("""
        SELECT
            a.auditor_cf                                    AS auditor,
            COUNT(DISTINCT a.id)                            AS total_auditorias,
            ROUND(AVG(a.percentual_conformidade), 1)        AS media_score,
            SUM(a.total_nc)                                 AS total_nc,
            COUNT(s.id)                                     AS total_sugestoes,
            SUM(CASE WHEN s.aceita=1 THEN 1 ELSE 0 END)    AS sugestoes_aceitas,
            SUM(CASE WHEN s.aceita=0 THEN 1 ELSE 0 END)    AS sugestoes_ignoradas
        FROM auditorias a
        LEFT JOIN sugestoes s ON s.auditoria_id = a.id
        WHERE a.auditor_cf IS NOT NULL
        GROUP BY a.auditor_cf
        ORDER BY media_score DESC
    """).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        aceitas  = d.get("sugestoes_aceitas") or 0
        total_s  = d.get("total_sugestoes") or 0
        d["taxa_aceitacao"] = round(aceitas / total_s * 100, 1) if total_s > 0 else None
        result.append(d)
    return result


# ── Configurações de itens ────────────────────────────────────────────────────

def listar_config_itens(checklist_id: str = None) -> list[dict]:
    conn = get_conn()
    if checklist_id:
        rows = conn.execute(
            "SELECT * FROM config_itens WHERE checklist_id=? ORDER BY item_nome",
            (checklist_id,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM config_itens ORDER BY checklist_id, item_nome").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def upsert_config_item(checklist_id: str, item_nome: str, habilitado: bool,
                       validacao_tipo: str = "sugestao", exige_imagem: bool = False,
                       criado_por: int = None):
    conn = get_conn()
    existe = conn.execute(
        "SELECT id FROM config_itens WHERE checklist_id=? AND item_nome=?",
        (checklist_id, item_nome)
    ).fetchone()
    if existe:
        conn.execute("""
            UPDATE config_itens
            SET habilitado=?, validacao_tipo=?, exige_imagem=?, atualizado_em=datetime('now')
            WHERE checklist_id=? AND item_nome=?
        """, (int(habilitado), validacao_tipo, int(exige_imagem), checklist_id, item_nome))
    else:
        conn.execute("""
            INSERT INTO config_itens
                (checklist_id, item_nome, habilitado, validacao_tipo, exige_imagem, criado_por)
            VALUES (?,?,?,?,?,?)
        """, (checklist_id, item_nome, int(habilitado), validacao_tipo, int(exige_imagem), criado_por))
    conn.commit()
    conn.close()


# ── Upsert de auditoria (substitui registrar_auditoria original) ──────────────

def registrar_auditoria_v2(evaluation_id: int, usuario_id: int | None, cabecalho: dict, resumo: dict) -> int:
    """
    Upsert: atualiza registro existente ou cria novo.
    Sempre salva snapshot em reprocessamentos para histórico completo.
    """
    conn = get_conn()

    existente = conn.execute(
        "SELECT id, total_reprocessamentos FROM auditorias WHERE evaluation_id=?",
        (evaluation_id,)
    ).fetchone()

    if existente:
        auditoria_id = existente["id"]
        reprocessamentos = (existente["total_reprocessamentos"] or 0) + 1
        conn.execute("""
            UPDATE auditorias SET
                usuario_id=?, checklist=?, unidade=?, auditor_cf=?,
                data_inicio=?, status_cf=?, percentual_conformidade=?,
                nivel_conformidade=?, total_itens=?, total_nc=?,
                total_parciais=?, total_conformes=?,
                total_reprocessamentos=?,
                atualizado_em=datetime('now')
            WHERE evaluation_id=?
        """, (
            usuario_id,
            cabecalho.get("checklist_nome"),
            cabecalho.get("unidade_nome"),
            cabecalho.get("auditor_nome"),
            cabecalho.get("data_inicio"),
            cabecalho.get("status"),
            resumo.get("percentual_conformidade"),
            resumo.get("nivel_conformidade"),
            resumo.get("total_itens_relevantes", 0),
            resumo.get("total_nao_conformes", 0),
            resumo.get("total_parciais", 0),
            resumo.get("total_conformes", 0),
            reprocessamentos,
            evaluation_id,
        ))
    else:
        cur = conn.execute("""
            INSERT INTO auditorias
                (evaluation_id, usuario_id, checklist, unidade, auditor_cf,
                 data_inicio, status_cf, percentual_conformidade, nivel_conformidade,
                 total_itens, total_nc, total_parciais, total_conformes,
                 total_reprocessamentos)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)
        """, (
            evaluation_id,
            usuario_id,
            cabecalho.get("checklist_nome"),
            cabecalho.get("unidade_nome"),
            cabecalho.get("auditor_nome"),
            cabecalho.get("data_inicio"),
            cabecalho.get("status"),
            resumo.get("percentual_conformidade"),
            resumo.get("nivel_conformidade"),
            resumo.get("total_itens_relevantes", 0),
            resumo.get("total_nao_conformes", 0),
            resumo.get("total_parciais", 0),
            resumo.get("total_conformes", 0),
        ))
        auditoria_id = cur.lastrowid

    # Snapshot em reprocessamentos para histórico completo
    conn.execute("""
        INSERT INTO reprocessamentos
            (evaluation_id, usuario_id, percentual_conformidade,
             nivel_conformidade, total_itens, total_nc)
        VALUES (?,?,?,?,?,?)
    """, (
        evaluation_id, usuario_id,
        resumo.get("percentual_conformidade"),
        resumo.get("nivel_conformidade"),
        resumo.get("total_itens_relevantes", 0),
        resumo.get("total_nao_conformes", 0),
    ))

    conn.commit()
    conn.close()
    return auditoria_id


def historico_reprocessamentos(evaluation_id: int) -> list[dict]:
    """Retorna todas as versões processadas de uma auditoria específica."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT r.*, u.nome as usuario_nome
        FROM reprocessamentos r
        LEFT JOIN usuarios u ON u.id = r.usuario_id
        WHERE r.evaluation_id=?
        ORDER BY r.processado_em DESC
    """, (evaluation_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Uso de tokens ──────────────────────────────────────────────────────────────

CUSTO_INPUT_POR_M  = 3.00   # USD por 1M tokens input  — Claude Sonnet 4.6
CUSTO_OUTPUT_POR_M = 15.00  # USD por 1M tokens output — Claude Sonnet 4.6


def registrar_uso_tokens(
    evaluation_id: int | None,
    usuario_id: int | None,
    modelo: str,
    tipo_chamada: str,
    tokens_input: int,
    tokens_output: int,
):
    """Registra o consumo de tokens de uma chamada à API do Claude."""
    tokens_total = tokens_input + tokens_output
    custo_usd = round(
        (tokens_input  / 1_000_000) * CUSTO_INPUT_POR_M +
        (tokens_output / 1_000_000) * CUSTO_OUTPUT_POR_M,
        6
    )
    conn = get_conn()
    conn.execute("""
        INSERT INTO uso_tokens
            (evaluation_id, usuario_id, modelo, tipo_chamada,
             tokens_input, tokens_output, tokens_total, custo_usd)
        VALUES (?,?,?,?,?,?,?,?)
    """, (evaluation_id, usuario_id, modelo, tipo_chamada,
          tokens_input, tokens_output, tokens_total, custo_usd))
    conn.commit()
    conn.close()


def resumo_uso_tokens(dias: int = 30) -> dict:
    """Retorna resumo de consumo dos últimos N dias."""
    conn = get_conn()
    row = conn.execute("""
        SELECT
            COUNT(*)                      AS total_chamadas,
            SUM(tokens_input)             AS total_input,
            SUM(tokens_output)            AS total_output,
            SUM(tokens_total)             AS total_tokens,
            ROUND(SUM(custo_usd), 4)      AS custo_total_usd,
            COUNT(DISTINCT evaluation_id) AS auditorias_processadas
        FROM uso_tokens
        WHERE criado_em >= datetime('now', ?)
    """, (f"-{dias} days",)).fetchone()
    conn.close()
    return dict(row) if row else {}


def uso_tokens_por_dia(dias: int = 30) -> list[dict]:
    """Retorna consumo agrupado por dia."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT
            DATE(criado_em)          AS dia,
            SUM(tokens_total)        AS tokens,
            ROUND(SUM(custo_usd), 4) AS custo_usd,
            COUNT(*)                 AS chamadas
        FROM uso_tokens
        WHERE criado_em >= datetime('now', ?)
        GROUP BY DATE(criado_em)
        ORDER BY dia DESC
    """, (f"-{dias} days",)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def excluir_usuario(uid: int):
    conn = get_conn()
    analistas = conn.execute(
        "SELECT COUNT(*) as n FROM usuarios WHERE perfil='analista' AND ativo=1"
    ).fetchone()["n"]
    usuario = conn.execute("SELECT perfil FROM usuarios WHERE id=?", (uid,)).fetchone()
    if usuario and usuario["perfil"] == "analista" and analistas <= 1:
        conn.close()
        raise ValueError("Não é possível excluir o único analista ativo do sistema.")
    conn.execute("DELETE FROM sessoes WHERE usuario_id=?", (uid,))
    conn.execute("DELETE FROM usuarios WHERE id=?", (uid,))
    conn.commit()
    conn.close()


def alterar_perfil(uid: int, novo_perfil: str):
    if novo_perfil not in ("auditor", "analista"):
        raise ValueError("Perfil inválido.")
    conn = get_conn()
    usuario = conn.execute("SELECT perfil FROM usuarios WHERE id=?", (uid,)).fetchone()
    if usuario and usuario["perfil"] == "analista" and novo_perfil == "auditor":
        analistas = conn.execute(
            "SELECT COUNT(*) as n FROM usuarios WHERE perfil='analista' AND ativo=1"
        ).fetchone()["n"]
        if analistas <= 1:
            conn.close()
            raise ValueError("Não é possível rebaixar o único analista ativo do sistema.")
    conn.execute("UPDATE usuarios SET perfil=? WHERE id=?", (novo_perfil, uid))
    conn.commit()
    conn.close()


def listar_inativos(dias: int = 90) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("""
        SELECT id, nome, email, perfil, ativo, ultimo_acesso,
               CAST(julianday('now') - julianday(COALESCE(ultimo_acesso, criado_em)) AS INTEGER) AS dias_inativo
        FROM usuarios
        WHERE CAST(julianday('now') - julianday(COALESCE(ultimo_acesso, criado_em)) AS INTEGER) >= ?
        ORDER BY dias_inativo DESC
    """, (dias,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]