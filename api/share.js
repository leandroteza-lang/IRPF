// api/share.js — cria link com a última resposta de um thread (Assistants v2)
export default async function handler(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  const base = "https://api.openai.com/v1";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "OpenAI-Beta": "assistants=v2" // obrigatório p/ Assistants v2
  };

  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const site = `${proto}://${host}`;

  // POST: devolve a URL pronta de compartilhar
  if (req.method === "POST") {
    const bodyText = req.body || "{}";
    const body = typeof bodyText === "string" ? JSON.parse(bodyText) : (bodyText || {});
    const threadId = (body.threadId || "").toString();
    if (!threadId) return res.status(400).json({ error: "threadId is required" });
    return res.status(200).json({ url: `${site}/api/share?tid=${encodeURIComponent(threadId)}` });
  }

  // GET: renderiza HTML com a última resposta do assistente
  if (req.method === "GET") {
    const urlObj = new URL(req.url, site);
    const tid = (urlObj.searchParams.get("tid") || "").toString();
    if (!tid) return html(res, 400, "<p>Parâmetro 'tid' é obrigatório.</p>");

    const r = await fetch(`${base}/threads/${tid}/messages?order=desc&limit=10`, { headers });
    const data = await r.json();
    if (!r.ok) {
      return html(res, 500, `<p>Erro ao buscar mensagens.</p><pre>${esc(JSON.stringify(data))}</pre>`);
    }

    let reply = "Sem resposta.";
    const assistantMsg = data?.data?.find?.(m => m.role === "assistant");
    const textItem = assistantMsg?.content?.find?.(c => c.type === "text");
    if (textItem?.text?.value) reply = textItem.text.value;

    // Aplica a mesma regra de pular linha entre itens de lista
    reply = formatLists(reply);

    return html(res, 200, `
      <h2>Resposta compartilhada</h2>
      <pre>${esc(reply)}</pre>
      <div style="opacity:.7;font-size:12px">Thread: ${esc(tid)}</div>
    `);
  }

  return res.status(405).json({ error: "Method not allowed" });

  // -------- helpers --------
  function formatLists(text) {
    let t = text;
    // 1., 2., 3. (apenas quando começam após \n)
    t = t.replace(/(\n)(\s*)(\d{1,3}\.)\s+/g, (_m, nl, sp, num) => `\n\n${sp}${num} `);
    // -, *, •
    t = t.replace(/(\n)(\s*)([-*•])\s+/g, (_m, nl, sp, b) => `\n\n${sp}${b} `);
    // normaliza \n em excesso
    t = t.replace(/\n{3,}/g, '\n\n');
    return t;
  }

  function html(res, code, body) {
    res.statusCode = code;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><meta charset="utf-8"><style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;background:#0b0f12;color:#e5e7eb}
      .card{max-width:860px;margin:0 auto;border:1px solid #374151;border-radius:12px;padding:16px;background:#111827}
      pre{
        white-space: pre-line;     /* permite justificar mantendo quebras */
        word-wrap: break-word;
        line-height: 1.6;
        text-align: justify;
        text-justify: inter-word;
        hyphens: auto;
      }
      @media (prefers-color-scheme: light){
        body{background:#fff;color:#111}
        .card{background:#f8fafc;border-color:#e2e8f0}
      }
    </style><div class="card">${body}</div>`);
  }
  function esc(s=""){return s
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");}
}
