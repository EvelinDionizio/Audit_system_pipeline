Vou colar um sistema já pronto (migrado de Python/FastAPI) em 12 mensagens numeradas, de 0 a 11. NÃO recrie, não redesenhe e não reescreva a aplicação — sua tarefa é colocá-la para funcionar no Lovable Cloud exatamente como está.

## Regras que valem para TODAS as mensagens
- NÃO ative o Lovable AI, o AI Gateway nem qualquer conector/integração de IA. A IA do sistema já está implementada: a edge function `revisar` chama a API da Anthropic diretamente pelo SDK `npm:@anthropic-ai/sdk`, usando o secret `ANTHROPIC_API_KEY`. Não substitua nem migre essa chamada para outro provedor.
- Quando eu enviar arquivos, crie cada um no caminho indicado com EXATAMENTE o conteúdo enviado (substitua se já existir). Não resuma, não reformate, não "melhore".
- Até a mensagem final, erros de build são esperados (faltam arquivos): NÃO tente corrigi-los. Apenas responda "Parte N recebida" com a lista de arquivos criados.
- NÃO altere regras de negócio, prompts, textos da interface, cores, nomes de tabelas/colunas ou o fluxo de login.
- NÃO habilite cadastro público (sign-up).
- NÃO modifique `src/integrations/supabase/client.ts` nem `src/integrations/supabase/types.ts` gerados por você.

Agora: garanta que o projeto usa o Lovable Cloud como backend e responda "Parte 0 recebida". Não crie nenhuma tela ainda.
