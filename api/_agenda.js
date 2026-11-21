// Biblioteca da agenda (Google Calendar + e-mail). Usada por /api/agenda.
// Arquivos que começam com "_" dentro de /api não viram rotas na Vercel.

import crypto from "node:crypto";
import nodemailer from "nodemailer";

// Lê variável de ambiente removendo BOM/aspas/espaços invisíveis
const env = (nome) => (process.env[nome] || "").replace(/[\uFEFF\u200B]/g, "").trim().replace(/^["']|["']$/g, "").trim();

export const CLINICA = {
  nome: "Essência da Pele",
  endereco: "Rua dos Ipês, 245 – Sala 302, Funcionários, Belo Horizonte – MG",
  whatsapp: "(31) 99999-4567",
  telefone: "(31) 3333-4567",
};

// ---- Regras da agenda ----
const TZ = "America/Sao_Paulo"; // Brasil não tem horário de verão desde 2019: offset fixo -03:00
const HORAS = [8, 9, 10, 11, 12, 13]; // segunda a sábado, 08:00 às 14:00, hora em hora
const DURACAO_MIN = 60;
const MAX_DIAS = 30;
const MAX_FUTUROS = 3; // agendamentos futuros por e-mail ou telefone (evita abuso e duplicidade)
export const SERVICOS = [
  "Avaliação inicial (gratuita)",
  "Limpeza de pele",
  "Peeling facial",
  "Hidratação facial",
  "Cuidados estéticos para pele acneica",
  "Rejuvenescimento facial",
  "Massagem facial",
  "Microagulhamento",
];

// ---------- datas ----------
const pad = (n) => String(n).padStart(2, "0");
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // AAAA-MM-DD
function somaDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diaSemanaNum = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const diaSemanaNome = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dataBR = (iso) => iso.split("-").reverse().join("/");
const rotuloDia = (iso) => `${cap(diaSemanaNome(iso))}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function erroDia(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "Escolha um dia da lista.";
  const hoje = hojeSP();
  if (iso <= hoje) return "Só é possível agendar a partir de amanhã.";
  if (iso > somaDias(hoje, MAX_DIAS)) return `Só é possível agendar até ${dataBR(somaDias(hoje, MAX_DIAS))}.`;
  if (diaSemanaNum(iso) === 0) return "A clínica fecha aos domingos.";
  return null;
}

// ---------- Google Calendar (sem bibliotecas: JWT da conta de serviço) ----------
let tokenCache = { token: null, exp: 0 };

async function googleToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
  const sa = JSON.parse(Buffer.from(env("GOOGLE_SA_B64"), "base64").toString("utf8"));
  const agora = Math.floor(Date.now() / 1000);
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const cab = b64u({ alg: "RS256", typ: "JWT" });
  const corpo = b64u({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  });
  const assinatura = crypto.createSign("RSA-SHA256").update(`${cab}.${corpo}`).sign(sa.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cab}.${corpo}.${assinatura}`,
    }),
  });
  if (!r.ok) throw new Error(`Google token ${r.status}`);
  const j = await r.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

async function calFetch(caminho, opcoes = {}) {
  const token = await googleToken();
  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env("GOOGLE_CALENDAR_ID"))}${caminho}`,
    { ...opcoes, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );
  if (!r.ok) throw new Error(`Calendar ${r.status}`);
  return r.json();
}

async function eventosEntre(isoIni, isoFim) {
  const q = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeMin: `${isoIni}T00:00:00-03:00`,
    timeMax: `${isoFim}T23:59:59-03:00`,
  });
  const j = await calFetch(`/events?${q}`);
  return (j.items || []).filter((e) => e.status !== "cancelled");
}

async function futurosDoCliente(chave, valor) {
  const q = new URLSearchParams({ singleEvents: "true", maxResults: "50", timeMin: new Date().toISOString() });
  q.append("privateExtendedProperty", `${chave}=${valor}`);
  const j = await calFetch(`/events?${q}`);
  return (j.items || []).filter((e) => e.status !== "cancelled").length;
}

const limites = (iso, hora) => {
  const ini = new Date(`${iso}T${pad(hora)}:00:00-03:00`);
  return [ini, new Date(ini.getTime() + DURACAO_MIN * 60000)];
};

function ocupado(eventos, ini, fim) {
  return eventos.some((e) => {
    const a = new Date(e.start.dateTime || `${e.start.date}T00:00:00-03:00`);
    const b = new Date(e.end.dateTime || `${e.end.date}T00:00:00-03:00`);
    return a < fim && b > ini;
  });
}

// ---------- funções usadas pela rota /api/agenda ----------
export function listarDias() {
  const hoje = hojeSP();
  const dias = [];
  for (let i = 1; i <= MAX_DIAS; i++) {
    const d = somaDias(hoje, i);
    if (!erroDia(d)) dias.push({ data: d, rotulo: rotuloDia(d) });
  }
  return dias;
}

export async function horariosDoDia(data) {
  const e = erroDia(data);
  if (e) return { erro: e };
  const eventos = await eventosEntre(data, data);
  const horarios = HORAS.filter((h) => {
    const [i, f] = limites(data, h);
    return !ocupado(eventos, i, f);
  }).map((h) => `${pad(h)}:00`);
  return { data, rotulo: rotuloDia(data), horarios };
}

async function enviaEmail({ nome, email, servico, data, hora }) {
  const transporte = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: env("GMAIL_USER"), pass: env("GMAIL_APP_PASSWORD").replace(/\s/g, "") },
  });
  const quando = `${diaSemanaNome(data)}, ${dataBR(data)} às ${hora}`;
  const texto =
    `Olá, ${nome}!\n\n` +
    `Seu agendamento na ${CLINICA.nome} está confirmado:\n\n` +
    `• Serviço: ${servico}\n` +
    `• Data e horário: ${quando}\n` +
    `• Endereço: ${CLINICA.endereco}\n\n` +
    `Qualquer alteração no seu agendamento será informada pela clínica com antecedência.\n` +
    `Para cancelar ou remarcar, avise com pelo menos 24 horas de antecedência: ` +
    `WhatsApp ${CLINICA.whatsapp} ou telefone ${CLINICA.telefone}.\n\n` +
    `Até breve!\n${CLINICA.nome}`;
  await transporte.sendMail({
    from: `"${CLINICA.nome}" <${env("GMAIL_USER")}>`,
    to: email,
    subject: `Agendamento confirmado: ${servico}, ${dataBR(data)} às ${hora}`,
    text: texto,
  });
}

export async function agendar(a) {
  const nome = String(a.nome || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const telefone = String(a.telefone || "").trim().slice(0, 30);
  const digitos = telefone.replace(/\D/g, "");
  const email = String(a.email || "").trim().toLowerCase().slice(0, 120);
  const servico = String(a.servico || "").trim();
  const data = String(a.data || "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(a.hora || "").trim());

  if (nome.split(" ").length < 2) return { ok: false, erro: "Informe seu nome e sobrenome." };
  if (digitos.length < 10 || digitos.length > 13) return { ok: false, erro: "Informe o telefone com DDD, por exemplo (31) 99999-9999." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: "Confira o e-mail: parece que está incompleto." };
  if (!SERVICOS.includes(servico)) return { ok: false, erro: "Escolha um serviço da lista." };
  const eDia = erroDia(data);
  if (eDia) return { ok: false, erro: eDia };
  if (!m || !HORAS.includes(Number(m[1])) || m[2] !== "00") return { ok: false, erro: "Escolha um horário da lista." };

  const [porEmail, porTel] = await Promise.all([futurosDoCliente("email", email), futurosDoCliente("tel", digitos)]);
  if (porEmail >= MAX_FUTUROS || porTel >= MAX_FUTUROS) {
    return {
      ok: false,
      erro: `Você já tem ${MAX_FUTUROS} agendamentos marcados. Para marcar outro, fale com a clínica pelo WhatsApp ${CLINICA.whatsapp}.`,
    };
  }

  const hora = Number(m[1]);
  const [ini, fim] = limites(data, hora);
  const eventos = await eventosEntre(data, data);
  if (ocupado(eventos, ini, fim)) {
    return { ok: false, conflito: true, erro: "Esse horário acabou de ser ocupado por outra pessoa. Escolha outro horário, por favor." };
  }

  const horaTxt = `${pad(hora)}:00`;
  await calFetch("/events", {
    method: "POST",
    body: JSON.stringify({
      summary: `${nome} — ${servico}`,
      description:
        `Cliente: ${nome}\nTelefone: ${telefone}\nE-mail: ${email}\nServiço: ${servico}\n` +
        `Agendado pelo formulário do site.`,
      start: { dateTime: `${data}T${horaTxt}:00`, timeZone: TZ },
      end: { dateTime: `${data}T${pad(hora + 1)}:00:00`, timeZone: TZ },
      extendedProperties: { private: { origem: "site", email, tel: digitos } },
    }),
  });

  let emailEnviado = false;
  try {
    await enviaEmail({ nome, email, servico, data, hora: horaTxt });
    emailEnviado = true;
  } catch (e) {
    console.error("Erro ao enviar e-mail:", e.message);
  }
  return {
    ok: true,
    agendamento: { nome, email, servico, data, rotulo: `${cap(diaSemanaNome(data))}, ${dataBR(data)}`, hora: horaTxt },
    email_enviado: emailEnviado,
    clinica: CLINICA,
  };
}
