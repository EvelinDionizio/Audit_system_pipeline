"""
criar_usuarios_lote.py — Cria usuários em lote no banco da Bernhoeft.
Rode na raiz do projeto:
    .venv\Scripts\python.exe criar_usuarios_lote.py
"""
import sys
import secrets
import string
sys.path.insert(0, "src")
from database import get_conn, hash_senha, buscar_usuario_por_email

USUARIOS = [
    {"email": "jrferreira@bernhoeft.com.br",    "nome": "Jr Ferreira",     "perfil": "analista"},
    {"email": "maria.bezerra@bernhoeft.com.br",  "nome": "Maria Bezerra",   "perfil": "analista"},
    {"email": "mvbarbosa@bernhoeft.com.br",       "nome": "MV Barbosa",      "perfil": "analista"},
    {"email": "raiane.santos@bernhoeft.com.br",   "nome": "Raiane Santos",   "perfil": "analista"},
    {"email": "maccioly@bernhoeft.com.br",        "nome": "Maccioly",        "perfil": "analista"},
]

def gerar_senha_temporaria() -> str:
    """Gera senha temporária que já respeita a política corporativa."""
    chars_mai = string.ascii_uppercase
    chars_min = string.ascii_lowercase
    chars_num = string.digits
    chars_all = chars_mai + chars_min + chars_num
    # Garante pelo menos 1 maiúscula, 1 minúscula, 1 número + 5 aleatórios
    senha = [
        secrets.choice(chars_mai),
        secrets.choice(chars_min),
        secrets.choice(chars_num),
        secrets.choice(chars_all),
        secrets.choice(chars_all),
        secrets.choice(chars_all),
        secrets.choice(chars_all),
        secrets.choice(chars_all),
    ]
    secrets.SystemRandom().shuffle(senha)
    return "".join(senha)

def main():
    conn = get_conn()
    print("=" * 55)
    print("  CRIAÇÃO DE USUÁRIOS — BERNHOEFT AUDITORIA")
    print("=" * 55)
    print()

    criados   = []
    existentes = []

    for u in USUARIOS:
        # Verifica se já existe
        existente = buscar_usuario_por_email(u["email"])
        if existente:
            existentes.append(u["email"])
            print(f"  [IGNORADO] {u['email']} — já cadastrado")
            continue

        senha_temp = gerar_senha_temporaria()
        conn.execute(
            """INSERT INTO usuarios (nome, email, senha_hash, perfil, senha_alterada_em)
               VALUES (?, ?, ?, ?, datetime('now', '-91 days'))""",
            (u["nome"], u["email"], hash_senha(senha_temp), u["perfil"])
        )
        criados.append({"email": u["email"], "nome": u["nome"], "senha": senha_temp, "perfil": u["perfil"]})
        print(f"  [OK] {u['email']} ({u['perfil']})")

    conn.commit()
    conn.close()

    print()
    print("=" * 55)
    print(f"  {len(criados)} usuário(s) criado(s) | {len(existentes)} ignorado(s)")
    print("=" * 55)

    if criados:
        print()
        print("  SENHAS TEMPORÁRIAS — envie individualmente a cada usuário")
        print("  A senha expira no primeiro acesso (rotação obrigatória)")
        print()
        for u in criados:
            print(f"  {u['email']}")
            print(f"  Senha: {u['senha']}")
            print(f"  Perfil: {u['perfil']}")
            print()

    print("  IMPORTANTE: cada usuário deverá redefinir a senha")
    print("  no primeiro acesso seguindo a política corporativa:")
    print("  mínimo 8 caracteres, maiúscula, minúscula e número.")
    print()

if __name__ == "__main__":
    main()
