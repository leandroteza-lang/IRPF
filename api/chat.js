// api/chat.js - Vercel Serverless Function (Node 18+)
// Modo: thread separado por usuário (sem OPENAI_THREAD_ID)
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  // Assistant ID predefinido no código, com fallback para env var
  const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_br9GQ4dRE2jDg9nLzSGyiLPG";

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

    // Sem thread fixa. Reutiliza thread local do usuário se enviada no body; senão cria uma nova.
    let threadId = clientThreadId;

    if (!threadId) {
      const threadRes = await fetch(`${base}/threads`, { method: "POST", headers });
      const thread = await threadRes.json();
      if (!threadRes.ok || !thread?.id) {
        return res.status(500).json({ error: "Failed to create thread", details: thread });
      }
      threadId = thread.id;
    }

    // Add user's message
    const msgRes = await fetch(`${base}/threads/${threadId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        role: "user",
        content: userMessage
      })
    });
    const msgData = await msgRes.json();
    if (!msgRes.ok) {
      return res.status(500).json({ error: "Failed to add message", details: msgData });
    }

    // Start run
    const runRes = await fetch(`${base}/threads/${threadId}/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ assistant_id: assistantId })
    });
    const run = await runRes.json();
    if (!runRes.ok || !run?.id) {
      return res.status(500).json({ error: "Failed to start run", details: run });
    }

    // Poll until completed
    let status = run.status;
    for (let i = 0; i < 60; i++) {
      if (status === "completed" || status === "failed" || status === "requires_action") break;
      await new Promise(r => setTimeout(r, 1000));
      const check = await fetch(`${base}/threads/${threadId}/runs/${run.id}`, {
        method: "GET",
        headers
      });
      const checkData = await check.json();
      status = checkData.status || "unknown";
      if (status === "failed") {
        return res.status(500).json({ error: "Run failed", details: checkData });
      }
    }

    if (status !== "completed") {
      return res.status(202).json({ status, threadId, info: "Run not completed yet. Try again." });
    }

    // Get assistant message
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
    if (Array.isArray(listData.data)) {
      const assistantMsg = listData.data.find(m => m.role === "assistant");
      if (assistantMsg && Array.isArray(assistantMsg.content)) {
        contentItems = assistantMsg.content;
        const textItem = assistantMsg.content.find(c => c.type === "text");
        if (textItem?.text?.value) reply = textItem.text.value;
      }
    }

    return res.status(200).json({ reply, threadId, status, contentItems });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal error", details: String(err?.message || err) });
  }
}
