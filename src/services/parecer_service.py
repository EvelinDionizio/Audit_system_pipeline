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

ANTHROPIC_API_KEY  = os.getenv("ANTHROPIC_API_KEY", "")
PARECER_MOCK       = os.getenv("PARECER_MOCK", "false").lower() == "true"
MODELO_CLAUDE      = os.getenv("MODELO_CLAUDE", "claude-sonnet-4-6")
MAX_TOKENS_PARECER = int(os.getenv("MAX_TOKENS_PARECER", "600"))  # reduzido para respostas concisas

_USE_MOCK = PARECER_MOCK or not ANTHROPIC_API_KEY

# ── System prompt cacheado ────────────────────────────────────────────────────
# Enviado uma vez e reutilizado em todas as chamadas da mesma sessão.
# O cache elimina ~70% dos tokens de input repetidos.

SYSTEM_PROMPT = """Você é auditor técnico sênior da Bernhoeft Auditoria, especialista em segurança do trabalho, meio ambiente e conformidade regulatória brasileira.

Ao receber dados de um item auditado, gere uma resposta estruturada com EXATAMENTE 5 seções numeradas:

1. Constatação: 1-2 frases descrevendo objetivamente o que foi identificado na auditoria.
2. Fundamentação normativa: OBRIGATÓRIO citar a norma com número e artigo/item exato (ex: "NR-1, item 1.7.1" ou "CLT, art. 158"). Jamais omita esta seção. Se os trechos fornecidos não forem suficientes, cite a norma mais aplicável ao contexto.
3. Recomendação: ações corretivas para o AUDITOR executar (ex: "Solicitar documentação", "Registrar evidência"). NÃO use "o auditor deve" — use imperativo direto.
4. Texto para o campo: Texto pronto para o auditor COPIAR E COLAR no checklist. Deve estar em primeira pessoa do plural ("Verificamos", "Constatamos", "Foi identificado"). Corrigir erros ortográficos da observação original. Para itens Não Conforme ou Parcialmente Conforme, incluir no final um plano de ação resumido: "PLANO DE AÇÃO: [empresa] deverá [ação] até [prazo sugerido]."
5. Criticidade: Alta, Média ou Baixa — uma frase de justificativa.

Regras obrigatórias:
- Máximo 300 palavras no total
- Seção 4 NUNCA menciona "o auditor" — é escrita como se fosse o próprio auditor registrando
- Português técnico e formal
- A seção Fundamentação normativa NUNCA pode ficar sem ao menos uma norma citada"""


# ── Prompt do usuário (variável por item) ─────────────────────────────────────

def _montar_prompt(item: dict, cabecalho: dict) -> str:
    """Monta o prompt do usuário — apenas os dados variáveis do item."""

    checklist    = cabecalho.get("checklist_nome", "N/A")
    unidade      = cabecalho.get("unidade_nome", "N/A")
    categoria    = item.get("categoria", "N/A")
    pergunta     = item.get("pergunta", "N/A")
    comentario   = item.get("comentario") or item.get("resposta_texto") or "Sem comentário."
    conformidade = "Não Conforme" if item.get("nao_conforme") else "Parcialmente Conforme"

    contexto_rag = item.get("contexto_rag", [])
    if contexto_rag:
        blocos = [
            f"[{chunk['fonte']}, p.{chunk['pagina']}] {chunk['texto']}"
            for chunk in contexto_rag[:3]  # máximo 3 trechos
        ]
        contexto_normativo = "\n".join(blocos)
    else:
        contexto_normativo = "Nenhum trecho normativo recuperado."

    return f"""AUDITORIA: {checklist} | {unidade}
CATEGORIA: {categoria}
ITEM: {pergunta}
RESULTADO: {conformidade}
OBSERVAÇÃO DO AUDITOR: {comentario}

TRECHOS NORMATIVOS:
{contexto_normativo}

Elabore o parecer técnico conciso conforme instruções."""


# ── Chamada à API ──────────────────────────────────────────────────────────────

def _chamar_claude(prompt: str, evaluation_id: int = None, usuario_id: int = None, tipo: str = "parecer_item") -> str:
    """Chama a API do Claude com system prompt cacheado, registra tokens e retorna o texto."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model=MODELO_CLAUDE,
            max_tokens=MAX_TOKENS_PARECER,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},  # cache do system prompt
                }
            ],
            messages=[{"role": "user", "content": prompt}],
        )
        texto = message.content[0].text.strip()

        # Registra uso de tokens no banco
        try:
            import sys, os
            sys.path.insert(0, os.path.dirname(__file__))
            from database import registrar_uso_tokens
            registrar_uso_tokens(
                evaluation_id=evaluation_id,
                usuario_id=usuario_id,
                modelo=MODELO_CLAUDE,
                tipo_chamada=tipo,
                tokens_input=message.usage.input_tokens,
                tokens_output=message.usage.output_tokens,
            )
            print(f"[Tokens] {tipo} — input={message.usage.input_tokens} output={message.usage.output_tokens}")
        except Exception as e_tok:
            print(f"[Tokens] Erro ao registrar: {e_tok}")

        return texto
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


# ── Nova interface para a API web ──────────────────────────────────────────────

def _extrair_texto_campo(parecer: str) -> str:
    """Extrai a seção 'Texto para o campo' — pronto para copiar e colar."""
    if not parecer:
        return None
    linhas = parecer.split("\n")
    capturando = False
    resultado = []
    for linha in linhas:
        l = linha.strip()
        l_lower = l.lower()
        if ("texto para o campo" in l_lower or "texto para campo" in l_lower) and (
            "**" in l or l.startswith("#") or l[0:2].isdigit()
        ):
            resto = l
            for sep in ["**", "##", "#", "4.", "3."]:
                resto = resto.replace(sep, "")
            resto = resto.replace("Texto para o campo", "").replace("Texto para campo", "").lstrip(" .:").strip()
            if resto:
                resultado.append(resto)
            capturando = True
            continue
        if capturando:
            if l and ("**" in l or l.startswith("#")) and any(
                x in l_lower for x in ["criticidade", "constatação", "fundamenta", "recomenda"]
            ):
                break
            if l:
                resultado.append(l)
    return " ".join(resultado).strip() or None
    """
    Detecta erros ortográficos comuns ou citações incorretas no texto do auditor.
    Verifica comentários e respostas de texto livre.
    """
    import re
    texto = " ".join(filter(None, [
        item.get("comentario") or "",
        item.get("resposta_texto") or "",
    ])).lower().strip()

    if not texto or len(texto) < 3:
        return False

    # Padrões que indicam erro ortográfico ou digitação incorreta
    padroes_erro = [
        r'\b\w*ll\w*\b',          # duplo-l suspeito (parciallmente, etc)
        r'\b\w{2,}mn\w*\b',       # sequências incomuns
        r'\bparcialm[^e]',        # "parcialm" sem "ente" depois
        r'\bnao\s+conform[^e]',   # "nao conform" sem o "e"
        r'\b\w*ment[^e ]\w*\b',   # "ment" sem "e" no final
    ]

    for padrao in padroes_erro:
        if re.search(padrao, texto):
            return True

    # Detecção de palavras com tamanho anômalo (digitação cortada)
    palavras = texto.split()
    for palavra in palavras:
        palavra_limpa = re.sub(r'[^a-záéíóúãõâêîôûàèìòùç]', '', palavra)
        if len(palavra_limpa) > 4:
            # Verifica se tem sequências de consoantes impossíveis em português
            if re.search(r'[bcdfghjklmnpqrstvwxyz]{4,}', palavra_limpa):
                return True

    return False


def _tem_erro_ortografico(item: dict) -> bool:
    """
    Detecta erros ortográficos ou digitação incorreta no texto do auditor.
    """
    import re
    texto = " ".join(filter(None, [
        item.get("comentario") or "",
        item.get("resposta_texto") or "",
    ])).lower().strip()

    if not texto or len(texto) < 3:
        return False

    # Padrões que indicam erro ortográfico
    padroes_erro = [
        r'\bparcialm[^e]',             # "parcialm" sem "ente"
        r'\bnao\s+conform[^e\s]',      # "nao conform" incompleto
        r'\b\w*llm\w*\b',              # duplo-l antes de consoante (parciallmentr)
        r'\b\w+[aeiou]{4,}\w*\b',      # sequência excessiva de vogais
    ]
    for padrao in padroes_erro:
        if re.search(padrao, texto):
            return True

    # Detecta palavras com sequências de consoantes impossíveis
    palavras = texto.split()
    for palavra in palavras:
        limpa = re.sub(r'[^a-záéíóúãõâêîôûàèìòùç]', '', palavra)
        if len(limpa) > 4 and re.search(r'[bcdfghjklmnpqrstvwxyz]{4,}', limpa):
            return True

    return False


def gerar_parecer(payload: dict) -> dict:
    """
    Interface principal chamada pelo review_api.py.

    Recebe o payload estruturado pelo polling_service/enrichment_service,
    aplica RAG nos itens não conformes/parciais, gera pareceres e
    retorna dict com formato esperado pelo frontend:

        {
            "itens": [
                {
                    "item_id": ...,
                    "categoria": ...,
                    "pergunta": ...,
                    "criticidade": ...,
                    "resposta_original": ...,
                    "sugestao": ...,
                    "justificativa": ...
                },
                ...
            ],
            "parecer": "Texto do parecer técnico geral..."
        }
    """
    from services.rag_service import query_items_batch, get_collection_stats

    cabecalho = payload.get("cabecalho", {})
    itens     = payload.get("itens", [])

    # Aplica RAG se o banco vetorial tiver conteúdo
    stats = get_collection_stats()
    if stats["total_chunks"] > 0:
        itens = query_items_batch(itens)
    else:
        print("[ParecerService] Banco vetorial vazio — RAG desativado.")
        itens = [{**i, "contexto_rag": []} for i in itens]

    # Gera parecer por item (não conformes, parciais e itens com erros ortográficos)
    itens_processados = []
    for item in itens:
        tem_erro_texto = _tem_erro_ortografico(item)
        if item.get("nao_conforme") or item.get("parcial") or tem_erro_texto:
            item_com_parecer = gerar_parecer_item(item, cabecalho)
            item_com_parecer["tem_erro_texto"] = tem_erro_texto
        else:
            item_com_parecer = {**item, "parecer": None, "tem_erro_texto": False}
        itens_processados.append(item_com_parecer)

    # Detecta criticidade a partir do nome da pergunta (Mandatório / Importantes / Desejáveis)
    def _criticidade(item: dict) -> str:
        pergunta = item.get("pergunta", "")
        if "(Mandatório)" in pergunta:
            return "Mandatório"
        if "(Importantes)" in pergunta:
            return "Importantes"
        if "(Desejáveis)" in pergunta:
            return "Desejáveis"
        return ""

    # Monta lista de sugestões para o frontend
    itens_frontend = []
    for item in itens_processados:
        parecer_texto = item.get("parecer") or ""
        recomendacao = None
        texto_campo  = None
        if parecer_texto:
            recomendacao = _extrair_recomendacao(parecer_texto) or parecer_texto
            texto_campo  = _extrair_texto_campo(parecer_texto)

        # Obrigatório se: Mandatório com problema OU tem erro ortográfico/citação
        tem_erro = item.get("tem_erro_texto", False)
        crit     = _criticidade(item)
        obrigatorio = (crit == "Mandatório" and recomendacao) or tem_erro

        itens_frontend.append({
            "item_id":           item.get("id"),
            "categoria":         item.get("categoria", ""),
            "pergunta":          item.get("pergunta", ""),
            "criticidade":       crit,
            "obrigatorio":       obrigatorio,
            "resposta_original": item.get("comentario") or item.get("resposta_texto") or "",
            "sugestao":          recomendacao,
            "texto_campo":       texto_campo,
            "justificativa":     _extrair_constatacao(parecer_texto) if parecer_texto else None,
        })

    # Gera parecer técnico geral consolidado
    parecer_geral = _gerar_parecer_geral(cabecalho, itens_processados)

    return {
        "itens":   itens_frontend,
        "parecer": parecer_geral,
    }


def _extrair_recomendacao(parecer: str) -> str:
    """Extrai a seção Recomendação — tolera variações de formatação do Claude."""
    if not parecer:
        return None
    linhas = parecer.split("\n")
    capturando = False
    resultado = []
    for linha in linhas:
        l = linha.strip()
        l_lower = l.lower()
        # Detecta início da seção recomendação
        if "recomenda" in l_lower and ("**" in l or l.startswith("#") or l[0:2].isdigit()):
            # Extrai texto inline após o marcador
            resto = l
            for sep in ["**", "##", "#", "3.", "4."]:
                resto = resto.replace(sep, "")
            resto = resto.lstrip(" .:").strip()
            if resto:
                resultado.append(resto)
            capturando = True
            continue
        if capturando:
            # Para quando encontra nova seção
            if l and ("**" in l or l.startswith("#")) and any(
                x in l.lower() for x in ["criticidade", "constatação", "constatacao", "fundamenta"]
            ):
                break
            if l:
                resultado.append(l)
    return " ".join(resultado).strip() or None


def _extrair_constatacao(parecer: str) -> str:
    """Extrai a seção Constatação — tolera variações de formatação do Claude."""
    if not parecer:
        return None
    linhas = parecer.split("\n")
    capturando = False
    resultado = []
    for linha in linhas:
        l = linha.strip()
        l_lower = l.lower()
        # Detecta início da seção constatação
        if ("constatação" in l_lower or "constatacao" in l_lower) and (
            "**" in l or l.startswith("#") or l[0:2].isdigit()
        ):
            resto = l
            for sep in ["**", "##", "#", "1.", "2."]:
                resto = resto.replace(sep, "")
            resto = resto.lstrip(" .:").strip()
            # Remove a palavra "constatação" do início se ficou
            for p in ["constatação", "constatacao"]:
                if resto.lower().startswith(p):
                    resto = resto[len(p):].lstrip(" .:").strip()
            if resto:
                resultado.append(resto)
            capturando = True
            continue
        if capturando:
            if l and ("**" in l or l.startswith("#")) and any(
                x in l.lower() for x in ["fundamenta", "recomenda", "criticidade"]
            ):
                break
            if l:
                resultado.append(l)
    return " ".join(resultado).strip() or None


def _gerar_parecer_geral(cabecalho: dict, itens: list[dict]) -> str:
    """
    Gera um parecer técnico consolidado da auditoria completa.
    Se _USE_MOCK, retorna texto simulado.
    Se API real, consolida os pareceres individuais num texto final.
    """
    checklist = cabecalho.get("checklist_nome", "N/A")
    unidade   = cabecalho.get("unidade_nome", "N/A")
    auditor   = cabecalho.get("auditor_nome", "N/A")

    nao_conformes = [i for i in itens if i.get("nao_conforme")]
    parciais      = [i for i in itens if i.get("parcial")]

    if _USE_MOCK:
        return (
            f"[PARECER GERAL SIMULADO — modo mock ativo]\n\n"
            f"Auditoria: {checklist}\n"
            f"Unidade: {unidade}\n"
            f"Auditor: {auditor}\n\n"
            f"Foram identificados {len(nao_conformes)} item(ns) não conforme(s) "
            f"e {len(parciais)} item(ns) parcialmente conforme(s).\n\n"
            f"[Parecer técnico completo será gerado pela API do Claude]"
        )

    if not (nao_conformes or parciais):
        return (
            f"A auditoria da unidade {unidade} ({checklist}) não apresentou "
            f"não conformidades ou itens parciais nos itens respondidos. "
            f"Os registros encontram-se em conformidade com os requisitos avaliados."
        )

    # Consolida pareceres individuais num resumo executivo via Claude
    pareceres_individuais = []
    for item in nao_conformes + parciais:
        if item.get("parecer"):
            pareceres_individuais.append(
                f"• {item.get('categoria', '')} — {item.get('pergunta', '')[:80]}:\n"
                f"  {item['parecer'][:300]}..."
            )

    prompt_consolidado = f"""Você é um auditor técnico sênior da Bernhoeft Auditoria.

Com base nos pareceres individuais abaixo, elabore um parecer técnico executivo consolidado
em português formal para a seguinte auditoria:

- Checklist: {checklist}
- Unidade auditada: {unidade}
- Auditor responsável: {auditor}
- Não conformidades: {len(nao_conformes)}
- Itens parciais: {len(parciais)}

PARECERES INDIVIDUAIS:
{chr(10).join(pareceres_individuais[:5])}

Elabore um parecer executivo com:
1. Síntese das principais não conformidades identificadas
2. Riscos associados e urgência de correção
3. Recomendações prioritárias
4. Conclusão geral

Máximo de 3 parágrafos. Português formal e técnico."""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model=MODELO_CLAUDE,
            max_tokens=800,
            messages=[{"role": "user", "content": prompt_consolidado}],
        )
        return message.content[0].text.strip()
    except Exception as e:
        print(f"[ParecerService] Erro no parecer geral: {e}")
        return (
            f"Auditoria {checklist} — {unidade}.\n"
            f"Identificados {len(nao_conformes)} não conformidade(s) e "
            f"{len(parciais)} item(ns) parcial(is). "
            f"Consulte os pareceres individuais para detalhamento."
        )