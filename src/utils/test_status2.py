import requests
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

TOKEN = os.getenv("CHECKLIST_FACIL_API_TOKEN")
print("Token carregado:", repr(TOKEN[:20]) if TOKEN else "None")

EVALUATION_ID = 206280510  # <-- confirma que está assim

headers = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"}

r1 = requests.get(
    "https://app.checklistfacil.com.br/api/analytics/v1/evaluations",
    headers=headers,
    params={"status": 2, "limit": 10}
)
print("Listing status=2:", r1.status_code)
print(r1.text[:500])

print("\n---\n")

r2 = requests.get(
    f"https://integration.checklistfacil.com.br/v2/evaluations/{EVALUATION_ID}",
    headers=headers
)
print("Detalhe:", r2.status_code)
print(r2.text[:3000])