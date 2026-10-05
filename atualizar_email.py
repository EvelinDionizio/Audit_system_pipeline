import sys
sys.path.insert(0, "src")
from database import get_conn

NOVO_EMAIL  = "evelin.silva@bernhoeft.com.br"
EMAIL_ATUAL = "admin@bernhoeft.com.br"

conn = get_conn()
conn.execute("UPDATE usuarios SET email=? WHERE email=?", (NOVO_EMAIL, EMAIL_ATUAL))
conn.commit()

row = conn.execute("SELECT email, perfil FROM usuarios WHERE email=?", (NOVO_EMAIL,)).fetchone()
if row:
    print(f"E-mail atualizado com sucesso: {row[0]} ({row[1]})")
else:
    print("Usuário não encontrado — verifique se o banco está no caminho correto.")
conn.close()