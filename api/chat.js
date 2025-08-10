// api/chat.js - Vercel Serverless Function (Node 18+)
// Threads separados por usuário + AVISO quando a resposta usar arquivo (base)
// Modo do aviso: auto (só quando há file_citation) ou always (sempre), via env SHOW_BASE_NOTICE
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_br9GQ4dRE2jDg9nLzSGyiLPG";
  const noticeMode = (process.env.SHOW_BASE_NOTICE || "auto").toLowerCase(); // "auto" | "always"

  if (!apiKey || !assistantId) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY or OPENAI_ASSISTANT_ID" });
  }

  try {
    const body = JSON.parse(req.body || "{}");
    const userMessage = (body.message || "").toString();
    let clientThreadId = (body.threadId || "").toString() || null;

    if (!userMessage) {
      return res.status(400).json({ error: "message is required" });
    }

    const base = "https://api.openai.com/v1";
    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2"
    };

    // 1) Thread (cria se não vier do cliente)
    let threadId = clientThreadId;
    if (!threadId) {
      const threadRes = await fetch(`${base}/threads`, { method: "POST", headers });
      const thread = await threadRes.json();
      if (!threadRes.ok || !thread?.id) {
        return res.status(500).json({ error: "Failed to create thread", details: thread });
      }
      threadId = thread.id;
    }

    // 2) Mensagem do usuário
    const msgRes = await fetch(`${base}/threads/${threadId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ role: "user", content: userMessage })
    });
    const msgData = await msgRes.json();
    if (!msgRes.ok) {
      return res.status(500).json({ error: "Failed to add message", details: msgData });
    }

    // 3) Run
    const runRes = await fetch(`${base}/threads/${threadId}/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ assistant_id: assistantId })
    });
    const run = await runRes.json();
    if (!runRes.ok || !run?.id) {
      return res.status(500).json({ error: "Failed to start run", details: run });
    }

    // 4) Poll
    let status = run.status;
    for (let i = 0; i < 60; i++) {
      if (status === "completed" || status === "failed" || status === "requires_action") break;
      await new Promise(r => setTimeout(r, 1000));
      const check = await fetch(`${base}/threads/${threadId}/runs/${run.id}`, { method: "GET", headers });
      const checkData = await check.json();
      status = checkData.status || "unknown";
      if (status === "failed") {
        return res.status(500).json({ error: "Run failed", details: checkData });
      }
    }
    if (status !== "completed") {
      return res.status(202).json({ status, threadId, info: "Run not completed yet. Try again." });
    }

    // 5) Última mensagem do assistente
    const listRes = await fetch(`${base}/threads/${threadId}/messages?order=desc&limit=10`, {
      method: "GET",
      headers
    });
    const listData = await listRes.json();
    if (!listRes.ok) {
      return res.status(500).json({ error: "Failed to list messages", details: listData });
    }

    let reply = "Sem resposta";
    let contentItems = [];
    let fromBase = false; // vira true se houver qualquer file_citation

    if (Array.isArray(listData.data)) {
      const assistantMsg = listData.data.find(m => m.role === "assistant");
      if (assistantMsg && Array.isArray(assistantMsg.content)) {
        contentItems = assistantMsg.content;

        const textItem = assistantMsg.content.find(c => c.type === "text");
        if (textItem?.text?.value) reply = textItem.text.value;

        // Detecta citations de arquivo
        const textBlocks = assistantMsg.content.filter(c => c.type === "text");
        for (const block of textBlocks) {
          const anns = (block?.text?.annotations) || [];
          if (anns.some(a => a?.type === "file_citation")) {
            fromBase = true;
            break;
          }
        }

        // fallback: algumas libs rendem marcadores no texto (ex.: 【...】)
        if (!fromBase && /【.+】/.test(reply)) {
          fromBase = true;
        }
      }
    }

    // 6) Avisos — modo 'auto' (quando veio da base) ou 'always' (sempre)
    if (noticeMode === "always" || fromBase) {
      reply += "\n\nATENÇÃO: Informações geradas a partir do MANUAL DE PERGUTAS E RESPOSTAS IRPF 2025.\nATENÇÃO: Para correta interpreteção, CONSULTE seu contador LEANDRO TEZA";
    }

    return res.status(200).json({ reply, threadId, status, contentItems, fromBase, noticeMode });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal error", details: String(err?.message || err) });
  }
}
