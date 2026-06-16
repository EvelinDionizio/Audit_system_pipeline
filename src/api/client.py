import os
import requests
from dotenv import load_dotenv

load_dotenv()


def get_base_url() -> str:
    url = os.getenv("CHECKLIST_FACIL_BASE_URL")
    if not url:
        raise EnvironmentError("CHECKLIST_FACIL_BASE_URL não definida no .env")
    return url.rstrip("/")


def get_headers() -> dict:
    token = os.getenv("CHECKLIST_FACIL_API_TOKEN")
    if not token:
        raise EnvironmentError("CHECKLIST_FACIL_API_TOKEN não definida no .env")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Language": "pt-br",
    }


def get(endpoint: str, params: dict = None) -> dict:
    """Realiza uma requisição GET genérica para a API do Checklist Fácil."""
    url = f"{get_base_url()}/{endpoint.lstrip('/')}"

    print(f"[API] GET {url} | params={params}")

    response = requests.get(url, headers=get_headers(), params=params, timeout=30)

    print(f"[API] Status: {response.status_code}")

    # 404 com payload vazio = sem registros, não é erro de código
    if response.status_code == 404:
        return {"data": []}

    if response.status_code != 200:
        raise RuntimeError(
            f"Erro na requisição: {response.status_code} - {response.text}"
        )

    return response.json()
