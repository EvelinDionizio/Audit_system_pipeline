# Abra uma auditoria no CF, responda 2-3 itens SEM finalizar
# Cole o ID aqui e rode

import requests, os
from dotenv import load_dotenv
load_dotenv()

TOKEN = os.getenv("KHAGPU51IFHLxqIXMFeTDABva1Or6cNr0yJ0gXf4zDUY8GM77d2yCgw849h6hi0WN8mHc9VSZsgUNgC9TOyRBIYjjXpvayqvndWRy7yzf0MzH2ITvLVJxsdiSz9dkGpg")
EVALUATION_ID = 206280510  # <-- cole o ID da auditoria em andamento

headers = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"}

# Testa listing — aparece com status=2?
r1 = requests.get(
    "https://app.checklistfacil.com.br/api/analytics/v1/evaluations",
    headers=headers,
    params={"status": 2, "limit": 10}
)
print("Listing status=2:", r1.status_code, r1.text[:300])

# Testa detalhe — retorna itens parciais?
r2 = requests.get(
    f"https://integration.checklistfacil.com.br/v2/evaluations/{EVALUATION_ID}",
    headers=headers
)
print("Detalhe:", r2.status_code, r2.text[:500])