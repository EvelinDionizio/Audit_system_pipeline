"""
parecer_service.py — Geração de pareceres técnicos com Claude.

Modos de operação:
  - REAL:  ANTHROPIC_API_KEY definida no .env → chama a API do Claude
  - MOCK:  sem chave ou PARECER_MOCK=true    → gera parecer simulado para testes

Uso:
    from services.parecer_service import gerar_pareceres_auditoria
    payload = gerar_pareceres_auditoria(payload)
"""

import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
PARECER_MOCK      = os.getenv("PARECER_MOCK", "false").lower() == "true"
MODELO_CLAUDE     = os.getenv("MODELO_CLAUDE", "claude-sonnet-4-6")
MAX_TOKENS_PARECER = int(os.getenv("MAX_TOKENS_PARECER", "1024"))

_USE_MOCK = PARECER_MOCK or not ANTHROPIC_API_KEY


# ── Prompt ─────────────────────────────────────────────────────────────────────

def _montar_prompt(item: dict, cabecalho: dict) -> str:
    """Monta o prompt enviado ao Claude para geração do parecer."""

    # Dados da auditoria
    checklist   = cabecalho.get("checklist_nome", "N/A")
    unidade     = cabecalho.get("unidade_nome", "N/A")
    auditor     = cabecalho.get("auditor_nome", "N/A")
    categoria   = item.get("categoria", "N/A")
    pergunta    = item.get("pergunta", "N/A")
    comentario  = item.get("comentario") or "Sem comentário registrado."
    conformidade = "Não Conforme" if item.get("nao_conforme") else "Parcialmente Conforme"

    # Contexto normativo recuperado pelo RAG
    contexto_rag = item.get("contexto_rag", [])
    if contexto_rag:
        blocos = []
        for i, chunk in enumerate(contexto_rag, 1):
            blocos.append(
                f"[Fonte {i}: {chunk['fonte']}, p.{chunk['pagina']} — relevância: {chunk['score']}]\n"
                f"{chunk['texto']}"
            )
        contexto_normativo = "\n\n".join(blocos)
    else:
        contexto_normativo = "Nenhum trecho normativo recuperado para este item."

    prompt = f"""Você é um especialista em segurança do trabalho, meio ambiente e conformidade regulatória, atuando como auditor técnico sênior.

Com base nas informações da auditoria de campo e nos trechos normativos fornecidos, elabore um parecer técnico formal e fundamentado em português formal.

## DADOS DA AUDITORIA

- Checklist: {checklist}
- Unidade auditada: {unidade}
- Auditor responsável: {auditor}
- Categoria: {categoria}
- Pergunta auditada: {pergunta}
- Resultado: {conformidade}
- Observação do auditor: {comentario}

## TRECHOS NORMATIVOS RELEVANTES (recuperados automaticamente)

{contexto_normativo}

## INSTRUÇÃO

Elabore um parecer técnico estruturado contendo obrigatoriamente as seguintes seções:

1. **Constatação**: descreva objetivamente o que foi identificado durante a auditoria, com base na observação do auditor.
2. **Fundamentação normativa**: cite a(s) norma(s) aplicável(is) com número do artigo ou item, explicando o que é exigido.
3. **Recomendação**: indique as ações corretivas necessárias de forma clara e objetiva.
4. **Criticidade**: classifique como Alta, Média ou Baixa, com justificativa resumida.

Diretrizes de estilo:
- Português formal e técnico
- Direto e objetivo, sem introduções genéricas
- Extensão equivalente ao exemplo de referência (3 a 5 parágrafos)
- Não invente normas — baseie-se apenas nos trechos fornecidos
- Se os trechos normativos não forem suficientes, indique na fundamentação
"""
    return prompt


# ── Chamada à API ──────────────────────────────────────────────────────────────

def _chamar_claude(prompt: str) -> str:
    """Chama a API do Claude e retorna o texto do parecer."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model=MODELO_CLAUDE,
            max_tokens=MAX_TOKENS_PARECER,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()
    except Exception as e:
        print(f"[ParecerService] ERRO na chamada à API: {e}")
        return f"[ERRO NA GERAÇÃO DO PARECER: {e}]"


# ── Mock ───────────────────────────────────────────────────────────────────────

def _gerar_mock(item: dict) -> str:
    """Parecer simulado para testes sem chave de API."""
    conformidade = "Não Conforme" if item.get("nao_conforme") else "Parcialmente Conforme"
    categoria    = item.get("categoria", "N/A")
    pergunta     = item.get("pergunta", "N/A")
    comentario   = item.get("comentario") or "Sem comentário."
    fontes       = [c["fonte"] for c in item.get("contexto_rag", [])]
    fontes_str   = ", ".join(fontes) if fontes else "nenhuma fonte recuperada"

    return (
        f"[PARECER SIMULADO — modo mock ativo]\n\n"
        f"**Constatação:** Durante a auditoria de campo, foi identificada situação classificada como "
        f"{conformidade} no item '{pergunta}' (categoria: {categoria}). "
        f"Observação registrada pelo auditor: {comentario}\n\n"
        f"**Fundamentação normativa:** Com base nos trechos normativos recuperados ({fontes_str}), "
        f"a situação evidenciada contraria as disposições regulamentares aplicáveis. "
        f"[Fundamentação completa será gerada pela API do Claude]\n\n"
        f"**Recomendação:** Adotar as medidas corretivas necessárias para adequação à(s) norma(s) "
        f"identificada(s), com definição de prazo e responsável pela implementação.\n\n"
        f"**Criticidade:** Média — [Classificação definitiva será gerada pela API do Claude]"
    )


# ── Interface principal ────────────────────────────────────────────────────────

def gerar_parecer_item(item: dict, cabecalho: dict) -> dict:
    """
    Gera o parecer técnico para um único item não conforme ou parcial.
    Retorna o item com o campo 'parecer' adicionado.
    """
    if not (item.get("nao_conforme") or item.get("parcial")):
        return {**item, "parecer": None}

    if _USE_MOCK:
        parecer = _gerar_mock(item)
        modo = "mock"
    else:
        prompt  = _montar_prompt(item, cabecalho)
        parecer = _chamar_claude(prompt)
        modo = "api"

    return {**item, "parecer": parecer, "parecer_modo": modo}


def gerar_pareceres_auditoria(payload: dict) -> dict:
    """
    Processa todos os itens de uma auditoria, gerando pareceres
    para os não conformes e parciais.

    Atualiza payload["itens"] e payload["resumo"]["total_com_parecer"].
    """
    cabecalho = payload.get("cabecalho", {})
    itens     = payload.get("itens", [])
    audit_id  = cabecalho.get("id", "?")

    modo_str = "MOCK" if _USE_MOCK else f"API ({MODELO_CLAUDE})"
    print(f"[ParecerService] Auditoria {audit_id} — modo: {modo_str}")

    itens_processados = []
    total_pareceres   = 0

    for item in itens:
        if item.get("nao_conforme") or item.get("parcial"):
            print(f"  → Gerando parecer: item {item.get('id')} | {item.get('categoria', '')[:50]}")
            item_com_parecer = gerar_parecer_item(item, cabecalho)
            total_pareceres += 1
        else:
            item_com_parecer = {**item, "parecer": None}
        itens_processados.append(item_com_parecer)

    resumo = payload.get("resumo", {})
    resumo["total_com_parecer"] = total_pareceres

    return {**payload, "itens": itens_processados, "resumo": resumo}
