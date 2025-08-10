# Meu Assistente (threads separadas)

Projeto pronto para deploy no **Vercel**, usando seu Assistente **asst_br9GQ4dRE2jDg9nLzSGyiLPG** e criando **um thread por usuário** (sem `OPENAI_THREAD_ID`).

## Passos

1. Suba este repositório no GitHub.
2. No Vercel → *Add New Project* → selecione o repo.
3. Em *Environment Variables*, adicione:
   - `OPENAI_API_KEY` → sua chave da OpenAI
   - *(opcional)* `OPENAI_ASSISTANT_ID` → você pode deixar em branco (o código já usa `asst_br9GQ4dRE2jDg9nLzSGyiLPG` por padrão). Se quiser trocar depois, basta definir aqui.
4. Deploy e use o link.

Cada aba/navegador mantém seu `thread_id` em `localStorage`, preservando o contexto individual.

Fluxo: **Thread → Message → Run → listar Messages** (Assistants API v2).

Boa publicação!
