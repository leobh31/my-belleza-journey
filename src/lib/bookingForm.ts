// Formulário de agendamento do chat (sem IA): serviço, dia, horário e dados do cliente.
// Fala com /api/agenda, que consulta a agenda real e cria o evento.

type Dia = { data: string; rotulo: string };
type Clinica = { nome: string; endereco: string; whatsapp: string; telefone: string };
type Config = { servicos: string[]; dias: Dia[]; clinica: Clinica };

const API = "/api/agenda";
const WHATSAPP_PADRAO = "(31) 99999-4567";

const CLS = {
  rotulo: "block text-sm font-medium mb-1.5",
  campo:
    "w-full px-4 py-3 text-base border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
  erro: "text-sm text-destructive mt-1.5 hidden",
  principal:
    "w-full bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3.5 rounded-xl font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed",
  horario: "px-3 py-2.5 rounded-xl border text-sm font-medium transition-all",
};
const HORARIO_NORMAL = `${CLS.horario} bg-background border-border hover:border-primary`;
const HORARIO_ESCOLHIDO = `${CLS.horario} bg-primary text-primary-foreground border-primary`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

const mostra = (e: HTMLElement, msg: string) => {
  e.textContent = msg;
  e.classList.remove("hidden");
};
const limpa = (e: HTMLElement) => {
  e.textContent = "";
  e.classList.add("hidden");
};
const rolaAte = (e: HTMLElement) => e.scrollIntoView({ behavior: "smooth", block: "nearest" });

function formataTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function criaSelect(id: string, placeholder: string, opcoes: { valor: string; texto: string }[]) {
  const s = el("select", CLS.campo);
  s.id = id;
  s.append(new Option(placeholder, ""));
  opcoes.forEach((o) => s.append(new Option(o.texto, o.valor)));
  return s;
}

function criaInput(id: string, tipo: string, placeholder: string, autocomplete: string, modo = "") {
  const i = el("input", CLS.campo);
  i.id = id;
  i.type = tipo;
  i.placeholder = placeholder;
  i.setAttribute("autocomplete", autocomplete);
  if (modo) i.inputMode = modo;
  return i;
}

// Rótulo + campo + mensagem de erro logo abaixo do campo
function bloco(rotulo: string, controle: HTMLElement) {
  const div = el("div");
  const label = el("label", CLS.rotulo, rotulo);
  if (controle.id) label.htmlFor = controle.id;
  const erro = el("p", CLS.erro);
  erro.setAttribute("role", "alert");
  div.append(label, controle, erro);
  return { div, erro };
}

export async function openBookingForm() {
  const lista = document.getElementById("chat-messages");
  if (!lista) return;
  (window as any).showMessageInput?.();
  document.getElementById("booking-card")?.remove();

  const wrapper = el("div", "flex justify-start");
  wrapper.id = "booking-card";
  const card = el(
    "div",
    "w-full max-w-full md:max-w-[85%] rounded-2xl border border-border bg-background p-4 md:p-5 space-y-5"
  );
  card.append(el("p", "text-sm text-muted-foreground", "Preparando o formulário..."));
  wrapper.append(card);
  lista.append(wrapper);
  rolaAte(wrapper);

  try {
    const r = await fetch(API);
    const cfg: Config = await r.json();
    if (!cfg.dias || !cfg.servicos) throw new Error("config");
    construir(card, wrapper, cfg);
  } catch {
    card.replaceChildren(
      el(
        "p",
        "text-sm text-destructive",
        `Não consegui abrir a agenda agora. Tente de novo em instantes ou fale com a clínica pelo WhatsApp ${WHATSAPP_PADRAO}.`
      )
    );
  }
}

function construir(card: HTMLElement, wrapper: HTMLElement, cfg: Config) {
  const estado = { hora: "" };
  card.replaceChildren();

  const topo = el("div", "space-y-1");
  topo.append(
    el("h3", "font-serif text-xl font-semibold", "📅 Agendar horário"),
    el("p", "text-sm text-muted-foreground", "Leva menos de 1 minuto. Seu horário fica confirmado na hora, com aviso por e-mail.")
  );

  // 1) serviço
  const selServico = criaSelect("bk-servico", "Escolha o serviço", cfg.servicos.map((s) => ({ valor: s, texto: s })));
  const b1 = bloco("1. Qual serviço você deseja?", selServico);

  // 2) dia
  const selDia = criaSelect("bk-dia", "Escolha o dia", cfg.dias.map((d) => ({ valor: d.data, texto: d.rotulo })));
  const b2 = bloco("2. Em qual dia?", selDia);

  // 3) horário (aparece depois de escolher o dia)
  const secHorarios = el("div", "hidden");
  const infoHorarios = el("p", "text-sm text-muted-foreground mb-2");
  const gradeHorarios = el("div", "grid grid-cols-3 sm:grid-cols-4 gap-2");
  const erroHora = el("p", CLS.erro);
  erroHora.setAttribute("role", "alert");
  secHorarios.append(el("p", CLS.rotulo, "3. Escolha o horário"), infoHorarios, gradeHorarios, erroHora);

  // 4) dados do cliente
  const inpNome = criaInput("bk-nome", "text", "Nome e sobrenome", "name");
  const inpTel = criaInput("bk-tel", "tel", "(31) 99999-9999", "tel", "tel");
  const inpEmail = criaInput("bk-email", "email", "nome@email.com", "email", "email");
  inpTel.addEventListener("input", () => {
    inpTel.value = formataTelefone(inpTel.value);
  });
  const b3 = bloco("Seu nome completo", inpNome);
  const b4 = bloco("Seu telefone (com DDD)", inpTel);
  const b5 = bloco("Seu e-mail (para enviarmos a confirmação)", inpEmail);

  // campo-armadilha (honeypot): pessoas não veem; robôs preenchem
  // Nome _hp é improvável de ser preenchido por gerenciadores de senha/autofill
  const armadilha = el("input");
  armadilha.type = "text";
  armadilha.name = "_hp";
  armadilha.tabIndex = -1;
  armadilha.autocomplete = "off";
  armadilha.setAttribute("aria-hidden", "true");
  armadilha.style.cssText = "position:absolute;left:-9999px;opacity:0;height:0;width:0";

  const erroGeral = el("p", "text-sm text-destructive hidden rounded-xl bg-destructive/10 px-4 py-3");
  erroGeral.setAttribute("role", "alert");
  const btnConfirmar = el("button", CLS.principal, "Confirmar agendamento");
  btnConfirmar.type = "button";
  const btnVoltar = el("button", "w-full text-sm text-muted-foreground hover:text-foreground underline py-1", "Agora não, voltar ao chat");
  btnVoltar.type = "button";

  const dados = el("div", "space-y-4");
  dados.append(el("p", "text-sm font-semibold", "4. Seus dados"), b3.div, b4.div, b5.div, armadilha);

  card.append(topo, b1.div, b2.div, secHorarios, dados, erroGeral, btnConfirmar, btnVoltar);

  async function carregaHorarios(data: string) {
    estado.hora = "";
    limpa(erroHora);
    gradeHorarios.replaceChildren();
    if (!data) {
      secHorarios.classList.add("hidden");
      return;
    }
    secHorarios.classList.remove("hidden");
    infoHorarios.textContent = "Consultando a agenda...";
    try {
      const r = await fetch(`${API}?data=${encodeURIComponent(data)}`);
      const j = await r.json();
      if (j.erro) throw new Error(j.erro);
      if (!j.horarios.length) {
        infoHorarios.textContent = "Não há horários livres neste dia. Escolha outro dia, por favor.";
        return;
      }
      infoHorarios.textContent = "Toque no horário de sua preferência:";
      j.horarios.forEach((h: string) => {
        const b = el("button", HORARIO_NORMAL, h);
        b.type = "button";
        b.addEventListener("click", () => {
          estado.hora = h;
          limpa(erroHora);
          gradeHorarios.querySelectorAll("button").forEach((x) => (x.className = HORARIO_NORMAL));
          b.className = HORARIO_ESCOLHIDO;
        });
        gradeHorarios.append(b);
      });
    } catch {
      infoHorarios.textContent = "Não consegui consultar os horários agora. Escolha o dia de novo, por favor.";
    }
  }

  selDia.addEventListener("change", () => {
    limpa(b2.erro);
    carregaHorarios(selDia.value);
  });
  selServico.addEventListener("change", () => limpa(b1.erro));

  btnVoltar.addEventListener("click", () => wrapper.remove());

  btnConfirmar.addEventListener("click", async () => {
    [b1.erro, b2.erro, erroHora, b3.erro, b4.erro, b5.erro, erroGeral].forEach(limpa);
    const servico = selServico.value;
    const data = selDia.value;
    const nome = inpNome.value.trim().replace(/\s+/g, " ");
    const telefone = inpTel.value.trim();
    const digitos = telefone.replace(/\D/g, "");
    const email = inpEmail.value.trim();

    const problemas: [HTMLElement, string][] = [];
    if (!servico) problemas.push([b1.erro, "Escolha o serviço."]);
    if (!data) problemas.push([b2.erro, "Escolha o dia."]);
    else if (!estado.hora) problemas.push([erroHora, "Toque em um horário."]);
    if (nome.length < 5 || nome.split(" ").length < 2) problemas.push([b3.erro, "Digite seu nome e sobrenome."]);
    if (digitos.length < 10 || digitos.length > 11) problemas.push([b4.erro, "Digite o telefone com DDD, por exemplo (31) 99999-9999."]);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problemas.push([b5.erro, "Digite um e-mail válido, por exemplo nome@email.com."]);
    if (problemas.length) {
      problemas.forEach(([e, m]) => mostra(e, m));
      problemas[0][0].scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Agendando...";
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servico, data, hora: estado.hora, nome, telefone, email, _hp: armadilha.value }),
      });
      let j: any = {};
      try {
        j = await r.json();
      } catch {
        j = { erro: `Erro de comunicação (status ${r.status})` };
      }
      if (j.ok) {
        mostraConfirmacao(card, j);
        return;
      }
      // Mostra o erro EXATO que veio da API
      const msgErro = j.erro || j.message || `Erro ${r.status}: não foi possível agendar.`;
      console.error("Erro no agendamento:", j);
      mostra(erroGeral, msgErro);
      if (j.conflito) carregaHorarios(data);
    } catch (e) {
      console.error("Erro de rede:", e);
      mostra(erroGeral, `Sem conexão no momento. Tente de novo ou fale com a clínica pelo WhatsApp ${cfg.clinica.whatsapp}.`);
    }
    erroGeral.scrollIntoView({ behavior: "smooth", block: "center" });
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = "Confirmar agendamento";
  });
}

function mostraConfirmacao(card: HTMLElement, j: any) {
  const a = j.agendamento;
  const c: Clinica = j.clinica;
  card.replaceChildren();

  const topo = el("div", "text-center space-y-1");
  topo.append(el("div", "text-4xl", "✅"), el("h3", "font-serif text-xl font-semibold", "Agendamento confirmado!"));

  const linha = (rotulo: string, valor: string) => {
    const p = el("p");
    p.append(el("span", "font-semibold", `${rotulo} `), document.createTextNode(valor));
    return p;
  };
  const resumo = el("div", "rounded-xl bg-muted/60 p-4 space-y-2 text-sm");
  resumo.append(linha("Serviço:", a.servico), linha("Dia:", a.rotulo), linha("Horário:", a.hora), linha("Local:", c.endereco));

  const email = el(
    "p",
    "text-sm",
    j.email_enviado
      ? `Enviamos a confirmação para ${a.email}. Se não encontrar, olhe também na caixa de spam.`
      : "Não conseguimos enviar o e-mail agora, mas o seu horário está garantido. Guarde estas informações."
  );
  const aviso = el(
    "p",
    "text-sm text-muted-foreground",
    `Qualquer alteração no seu agendamento será informada pela clínica com antecedência. Para cancelar ou remarcar, avise com 24 horas de antecedência pelo WhatsApp ${c.whatsapp}.`
  );
  card.append(topo, resumo, email, aviso);
  rolaAte(card);

  // para o assistente saber, se o cliente continuar a conversa
  const w = window as any;
  w.chatHistory = w.chatHistory || [];
  w.chatHistory.push({
    role: "bot",
    text: `Agendamento confirmado pelo formulário: ${a.servico}, ${a.rotulo} às ${a.hora}. A confirmação foi enviada por e-mail.`,
  });
}

