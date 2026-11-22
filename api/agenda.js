// Rota da agenda: o formulário do site usa esta rota (sem IA no meio).
//   GET  /api/agenda              -> serviços, dias disponíveis e dados da clínica
//   GET  /api/agenda?data=AAAA-MM-DD -> horários livres do dia
//   POST /api/agenda              -> cria o agendamento e envia o e-mail de confirmação
import { SERVICOS, CLINICA, listarDias, horariosDoDia, agendar } from "./_agenda.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const data = req.query && req.query.data;
      if (data) return res.status(200).json(await horariosDoDia(String(data)));
      return res.status(200).json({ servicos: SERVICOS, dias: listarDias(), clinica: CLINICA });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      // Honeypot: campo oculto com nome improvável de ser preenchido por autofill
      // Aceita string vazia, null, undefined - só bloqueia se tiver conteúdo real
      const honeypot = body._hp || body.website || body.url || body.site;
      if (honeypot && String(honeypot).trim().length > 0) {
        console.warn("Honeypot acionado:", { ip: req.headers["x-forwarded-for"], ua: req.headers["user-agent"] });
        return res.status(400).json({ ok: false, erro: "Não foi possível concluir o agendamento." });
      }
      const r = await agendar(body);
      return res.status(r.ok ? 200 : 400).json(r);
    }
    return res.status(405).json({ ok: false, erro: "Método não permitido." });
  } catch (e) {
    console.error("Erro no /api/agenda:", e.message);
    return res.status(500).json({
      ok: false,
      erro: `Não foi possível acessar a agenda agora. Tente de novo em instantes ou fale com a clínica pelo WhatsApp ${CLINICA.whatsapp}.`,
    });
  }
}
