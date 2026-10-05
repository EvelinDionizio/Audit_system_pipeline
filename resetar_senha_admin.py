import sys
sys.path.insert(0, "src")
from database import get_conn, hash_senha

EMAIL      = "evelin.silva@bernhoeft.com.br"
NOVA_SENHA = "Admin@2026"

conn = get_conn()

# Tenta adicionar a coluna caso não exista (banco antigo)
try:
    conn.execute("ALTER TABLE usuarios ADD COLUMN senha_alterada_em TEXT DEFAULT (datetime('now'))")
    conn.commit()
except Exception:
    pass  # coluna já existe

cur = conn.execute(
    "UPDATE usuarios SET senha_hash=?, senha_alterada_em=datetime('now') WHERE email=?",
    (hash_senha(NOVA_SENHA), EMAIL)
)
conn.commit()

if cur.rowcount == 0:
    cur2 = conn.execute(
        "UPDATE usuarios SET senha_hash=?, senha_alterada_em=datetime('now') WHERE perfil='analista' AND ativo=1",
        (hash_senha(NOVA_SENHA),)
    )
    conn.commit()
    row = conn.execute("SELECT email FROM usuarios WHERE perfil='analista' AND ativo=1").fetchone()
    print(f"Senha redefinida para: {row['email'] if row else 'nenhum analista encontrado'}")
else:
    print(f"Senha redefinida para: {EMAIL}")

print(f"Nova senha: {NOVA_SENHA}")
conn.close()