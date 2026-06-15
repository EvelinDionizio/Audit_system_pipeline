import sys, os, requests
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()

TOKEN = os.getenv("CHECKLIST_FACIL_API_TOKEN")

# Testando a API Analytics
BASE_ANALYTICS = "https://app.checklistfacil.com.br/api/analytics"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "Accept-Language": "pt-br",
}

endpoints = [
    "v2/evaluations",
    "v1/evaluations",
    "v2/checklists-applied",
    "v1/checklists-applied",
]

print("=== Testando API Analytics ===\n")
for ep in endpoints:
    url = f"{BASE_ANALYTICS}/{ep}"
    r = requests.get(url, headers=headers, params={"limit": 5, "status": 3}, timeout=30)
    print(f"{ep}")
    print(f"  Status  : {r.status_code}")
    print(f"  Resposta: {r.text[:200]}\n")