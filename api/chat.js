// Backend do chatbot: RAG (Zilliz) + OpenAI. O agendamento NÃO passa por aqui: é feito pelo
// formulário do site (rota /api/agenda). Quando o cliente quer agendar, a resposta termina com
// o código [[AGENDAR]], que o site transforma na abertura do formulário.
// Aceita { sessionId, action, chatInput, history } e devolve { output }.

export const config = { maxDuration: 30 };

// Lê variável de ambiente removendo BOM/aspas/espaços invisíveis
const env = (nome) => (process.env[nome] || "").replace(/[\uFEFF\u200B]/g, "").trim().replace(/^["']|["']$/g, "").trim();

const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = env("OPENAI_MODEL") || "gpt-6-luna";
const COLECAO = "clinica_rag";
const DIM = 768;
const MIN_SCORE = 0.3; // embeddings da OpenAI têm notas de similaridade mais baixas

const SYSTEM_PROMPT = `Você é a assistente virtual da clínica de estética Essência da Pele. Fale em português do Brasil, com tom acolhedor, claro e profissional, em respostas curtas (no máximo 5 frases, ou uma lista curta quando ajudar).

Regras de informação:
- Responda sobre procedimentos, valores e funcionamento usando SOMENTE as informações do CONTEXTO fornecido.
- Se a informação não estiver no contexto, diga que não tem esse detalhe e ofereça encaminhar para uma atendente (WhatsApp (31) 99999-4567). Nunca invente preços, resultados ou prazos.
- Não faça diagnóstico nem prometa resultados. Em dúvidas de saúde (gravidez, medicamentos, doenças), explique o que o contexto diz sobre contraindicações e recomende avaliação presencial com a profissional.
- Não presuma nada sobre a situação pessoal do cliente que ele não tenha dito (por exemplo, se ele só perguntou se pode fazer um procedimento estando grávida, não afirme que ele está grávida).
- Se a conversa não tiver relação com a clínica, responda gentilmente que só pode ajudar com dúvidas e agendamentos da clínica.

**Listagem de procedimentos e valores:**
- Quando o cliente pedir lista de procedimentos, serviços, tratamentos ou valores, use o CONTEXTO para listar os procedimentos disponíveis com suas descrições e valores (quando disponíveis no contexto).
- Organize a resposta de forma clara, preferencialmente por categorias (facial, corporal, laser, etc.) se o contexto permitir.
- Se o contexto trouxer muitos procedimentos, liste os principais e mencione que há mais opções disponíveis.

Endereço e localização:
- O endereço da clínica é: Rua dos Ipês, 245 – Sala 302, Funcionários, Belo Horizonte – MG.
- NUNCA envie links do Google Maps, Waze ou qualquer outro mapa. Apenas informe o endereço em texto puro.
- Se o contexto trouxer algum link de mapa, ignore-o e responda só com o endereço acima.

Agendamento:
- O agendamento é feito por um formulário que aparece na tela, e não por conversa. Quando o cliente quiser agendar, marcar, reservar ou ver horários livres, responda com UMA frase curta e simpática convidando a preencher o formulário e escreva exatamente [[AGENDAR]] no final da resposta.
- Nunca peça nome, telefone, e-mail, dia ou horário no chat, nunca ofereça horários e nunca diga que um agendamento foi feito (só o formulário faz isso). Mensagens do tipo "Agendamento confirmado..." que aparecerem na conversa foram geradas pelo formulário e são verdadeiras.
- A clínica funciona de segunda a sábado, das 08:00 às 14:00 (domingo fechado).
- Cancelar ou remarcar não é feito por aqui: oriente a falar com a clínica pelo WhatsApp (31) 99999-4567 ou telefone (31) 3333-4567, com pelo menos 24 horas de antecedência. Qualquer alteração em um agendamento é informada pela clínica com antecedência.`;

// ---------- OpenAI ----------
async function openai(caminho, body) {
  // Tenta de novo (até 3 vezes) em sobrecarga momentânea: 429, 500, 502, 503, 504.
  let ultimo = 0;
  let detalhe = "";
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(`https://api.openai.com/v1/${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("OPENAI_API_KEY")}` },
      body: JSON.stringify(body),
    });
    if (r.ok) return r.json();
    ultimo = r.status;
    detalhe = (await r.text()).slice(0, 200);
    if (![429, 500, 502, 503, 504].includes(r.status)) break;
    await new Promise((ok) => setTimeout(ok, 700 * (tentativa + 1)));
  }
  throw new Error(`OpenAI ${caminho} ${ultimo} ${detalhe}`);
}

async function embed(texto) {
  const j = await openai("embeddings", { model: EMBED_MODEL, input: texto, dimensions: DIM });
  return j.data[0].embedding;
}

async function buscaZilliz(vetor) {
  const uri = env("ZILLIZ_URI").replace(/\/$/, "");
  const r = await fetch(`${uri}/v2/vectordb/entities/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("ZILLIZ_TOKEN")}` },
    body: JSON.stringify({
      collectionName: COLECAO,
      data: [vetor],
      annsField: "vector",
      limit: 4,
      outputFields: ["nome", "categoria", "tipo", "texto"],
    }),
  });
  if (!r.ok) throw new Error(`Zilliz ${r.status}`);
  const j = await r.json();
  if (j.code !== 0 && j.code !== 200) throw new Error(`Zilliz code ${j.code}`);
  return (j.data || []).filter((x) => (x.distance ?? 0) >= MIN_SCORE);
}

// ---------- handler ----------
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ output: "Método não permitido." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const pergunta = String(body.chatInput || "").trim().slice(0, 500);
    if (!pergunta) return res.status(400).json({ output: "Mensagem vazia." });

    // histórico enviado pelo site: [{ role: "user"|"bot", text: "..." }]
    const historico = Array.isArray(body.history) ? body.history.slice(-16) : [];
    while (historico.length && historico[0].role !== "user") historico.shift();

    // Detectar se a pergunta é sobre listagem de procedimentos/serviços
    const lowerPergunta = pergunta.toLowerCase();
    const ehListagemProcedimentos =
      lowerPergunta.includes('serviço') ||
      lowerPergunta.includes('procedimento') ||
      lowerPergunta.includes('tratamento') ||
      lowerPergunta.includes('valor') ||
      lowerPergunta.includes('preço') ||
      lowerPergunta.includes('custa') ||
      lowerPergunta.includes('oferecem') ||
      lowerPergunta.includes('fazem') ||
      lowerPergunta.includes('lista') ||
      lowerPergunta.includes('quais');

    // Busca pela pergunta sozinha e, se ela for curta (ex.: "e quanto tempo dura?"), também junto da
    // pergunta anterior do cliente. Os resultados das duas buscas são unidos, sem repetir.
    const anteriores = historico.filter((m) => m.role === "user").slice(-1).map((m) => String(m.text || "")).join(" ");
    const consultas = [pergunta];

    // Para listagem de procedimentos, adicionar consultas expandidas para melhor cobertura do RAG
    if (ehListagemProcedimentos) {
      consultas.push(
        "lista completa de procedimentos e tratamentos disponíveis na clínica",
        "todos os serviços oferecidos com valores e preços",
        "tratamentos faciais corporais laser preços"
      );
    }

    if (pergunta.length < 50 && anteriores) consultas.push(`${anteriores} ${pergunta}`.trim().slice(-600));
    const lotes = await Promise.all(consultas.map(async (q) => buscaZilliz(await embed(q))));
    const unicos = new Map();
    for (const x of lotes.flat()) {
      const atual = unicos.get(x.nome);
      if (!atual || x.distance > atual.distance) unicos.set(x.nome, x);
    }
    const resultados = [...unicos.values()].sort((a, b) => b.distance - a.distance).slice(0, 8);
    const contexto = resultados.length
      ? resultados.map((x, i) => `[${i + 1}] ${x.texto}`).join("\n\n")
      : "(nenhuma informação relevante encontrada)";

    const mensagens = [
      { role: "system", content: SYSTEM_PROMPT },
      ...historico
        .filter((m) => m && typeof m.text === "string")
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text.slice(0, 800) })),
      { role: "user", content: `CONTEXTO:\n${contexto}\n\nMENSAGEM DO CLIENTE:\n${pergunta}` },
    ];

    const j = await openai("chat/completions", {
      model: CHAT_MODEL,
      messages: mensagens,
      max_completion_tokens: 800,
      reasoning_effort: "none",
    });
    const texto = (j.choices?.[0]?.message?.content || "").trim();
    return res.status(200).json({ output: texto || "Desculpe, não consegui responder agora. Pode tentar de novo?" });
  } catch (e) {
    console.error("Erro no /api/chat:", e.message);
    return res.status(500).json({ output: "Desculpe, tive um problema para responder agora. Tente novamente em instantes." });
  }
}
