import { ArrowRight, CheckCircle, Star, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import heroImage from "@/assets/hero-clinic.jpg";
import facialImage from "@/assets/treatment-facial.jpg";
import laserImage from "@/assets/treatment-laser.jpg";
import bodyImage from "@/assets/treatment-body.jpg";
import { useEffect } from "react";
import { openBookingForm } from "@/lib/bookingForm";

const Index = () => {
  useEffect(() => {
    // Add chat integration functions to window
    (window as any).chatInitialized = false;
    (window as any).openBookingForm = openBookingForm;
    
    // Gerar sessionId único para a sessão de chat
    (window as any).chatSessionId = (window as any).chatSessionId || 
      Math.random().toString(16).substring(2) + Date.now().toString(16);

    (window as any).initializeChat = function() {
      if ((window as any).chatInitialized) return;
      (window as any).chatInitialized = true;

      // Abertura instantânea, sem chamar a IA: mensagem de boas-vindas e botões de atalho.
      const chatContainer = document.getElementById('chat-interface');
      if (chatContainer) chatContainer.innerHTML = '';
      (window as any).showMessageInput();
      (window as any).addMessageToChat('Olá! 😊 Eu sou a assistente virtual da Essência da Pele. Posso tirar suas dúvidas sobre tratamentos e valores, e você pode agendar o seu horário aqui mesmo. Como posso ajudar?', 'bot');
      (window as any).addQuickActions();
    };

    (window as any).addQuickActions = function() {
      const messagesContainer = document.getElementById('chat-messages');
      if (!messagesContainer) return;
      const acoes = [
        { texto: '📅 Agendar horário', fazer: () => (window as any).openBookingForm() },
        { texto: '💰 Serviços e valores', fazer: () => (window as any).listarProcedimentos() },
        { texto: '🕒 Horário e endereço', fazer: () => (window as any).selectOption('Qual o horário de funcionamento e o endereço da clínica?') },
        { texto: '❓ Tirar uma dúvida', fazer: () => { (document.getElementById('message-input') as HTMLInputElement | null)?.focus(); } },
      ];
      const bloco = document.createElement('div');
      bloco.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2';
      acoes.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = a.texto;
        b.className = 'text-left px-4 py-3 bg-white border border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-sm font-medium';
        b.addEventListener('click', a.fazer);
        bloco.appendChild(b);
      });
      messagesContainer.appendChild(bloco);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    // Função específica para listar procedimentos consultando o RAG
    (window as any).listarProcedimentos = function() {
      const pergunta = 'Liste todos os procedimentos, tratamentos e serviços disponíveis na clínica com suas descrições e valores, organizados por categoria (facial, corporal, laser)';
      (window as any).selectOption(pergunta);
    };

    (window as any).displayChatMessage = function(data: any) {
      const chatContainer = document.getElementById('chat-interface');

      if (data.message && chatContainer) {
        chatContainer.innerHTML = `
          <div class="space-y-6">
            <div class="bg-primary/5 rounded-2xl p-6">
              <p class="text-lg font-medium mb-4">${data.message}</p>
              ${data.options ? (window as any).createOptionsHTML(data.options) : ''}
            </div>
          </div>
        `;
      }
    };

    (window as any).createOptionsHTML = function(options: any[]) {
      return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          ${options.map(option => `
            <button
              class="bg-white border-2 border-primary/20 hover:border-primary hover:bg-primary/5 rounded-2xl p-4 text-left transition-all"
              onclick="selectOption('${option.value}')"
            >
              <h4 class="font-semibold mb-2">${option.title}</h4>
              <p class="text-sm text-muted-foreground">${option.description}</p>
            </button>
          `).join('')}
        </div>
      `;
    };

    (window as any).selectOption = function(value: string) {
      const webhookUrl = '/api/chat';

      // Adicionar mensagem do usuário
      (window as any).addMessageToChat(value, 'user');
      (window as any).showProcessingIndicator(true);

      // Formato correto para N8N Chat Node
      const payload = {
        sessionId: (window as any).chatSessionId,
        action: 'sendMessage',
        chatInput: value,
        history: (window as any).getChatHistory(value)
      };

      console.log('Enviando opção para N8N:', payload);

      fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      .then(async (response) => {
        console.log('Resposta N8N status:', response.status);
        try {
          const text = await response.text();
          console.log('Resposta N8N:', text);
          
          if (text) {
            try {
              const data = JSON.parse(text);
              // N8N Chat Node retorna a resposta no campo 'output'
              const botMessage = data.output || data.message || data.text;
              if (botMessage) {
                (window as any).addMessageToChat(botMessage, 'bot');
              } else {
                (window as any).displayChatMessage(data);
              }
            } catch {
              // Resposta é texto puro
              (window as any).addMessageToChat(text, 'bot');
            }
          } else {
            throw new Error('Empty response from webhook');
          }
        } catch (error) {
          console.log('Could not parse webhook response for option selection:', error);
          (window as any).addMessageToChat((window as any).getIntelligentFallback(value), 'bot');
        }
      })
      .catch(error => {
        console.error('Error sending option to webhook:', error);
        (window as any).addMessageToChat('Opção registrada. No momento estamos com problemas de conexão, mas posso te ajudar!', 'system');
      });
    };

    (window as any).showMessageInput = function() {
      const inputContainer = document.getElementById('message-input-container');
      const messagesContainer = document.getElementById('chat-messages');

      if (inputContainer) {
        inputContainer.classList.remove('hidden');
      }
      if (messagesContainer) {
        messagesContainer.classList.remove('hidden');
      }
    };

    (window as any).getChatHistory = function(current: string) {
      const h = ((window as any).chatHistory || []).slice();
      if (h.length && h[h.length - 1].role === 'user' && h[h.length - 1].text === String(current).slice(0, 800)) h.pop();
      return h.slice(-16);
    };

    (window as any).sendMessage = function() {
      const input = document.getElementById('message-input') as HTMLInputElement;
      const message = input?.value?.trim();

      if (!message) return;

      // Add user message to chat
      (window as any).addMessageToChat(message, 'user');
      input.value = '';

      (window as any).handleUserMessage(message);
    };

    (window as any).handleUserMessage = async function(userMessage: string) {
      const webhookUrl = '/api/chat';

      (window as any).showProcessingIndicator(true);

      // Formato correto para N8N Chat Node
      const payload = {
        sessionId: (window as any).chatSessionId,
        action: 'sendMessage',
        chatInput: userMessage,
        history: (window as any).getChatHistory(userMessage)
      };

      console.log('Enviando mensagem para N8N:', payload);

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        console.log('Resposta N8N status:', response.status);

        try {
          const text = await response.text();
          console.log('Resposta N8N:', text);

          if (text) {
            try {
              const data = JSON.parse(text);
              // N8N Chat Node retorna a resposta no campo 'output'
              const botMessage = data.output || data.message || data.text;
              if (botMessage) {
                (window as any).addMessageToChat(botMessage, 'bot');
              } else {
                (window as any).addMessageToChat((window as any).getIntelligentFallback(userMessage), 'bot');
              }
            } catch {
              // Resposta é texto puro
              (window as any).addMessageToChat(text, 'bot');
            }
          } else {
            (window as any).addMessageToChat((window as any).getIntelligentFallback(userMessage), 'bot');
          }
        } catch (err) {
          console.error('Error parsing webhook response:', err);
          (window as any).addMessageToChat((window as any).getIntelligentFallback(userMessage), 'bot');
        }
      } catch (error) {
        console.error('Error sending message to webhook:', error);
        (window as any).addMessageToChat((window as any).getIntelligentFallback(userMessage), 'bot');
      } finally {
        (window as any).showProcessingIndicator(false);
      }
    };

    (window as any).showProcessingIndicator = function(show: boolean) {
      const existente = document.getElementById('typing-indicator');
      if (!show) { existente?.remove(); return; }
      if (existente) return;
      const messagesContainer = document.getElementById('chat-messages');
      if (!messagesContainer) return;
      const indicador = document.createElement('div');
      indicador.id = 'typing-indicator';
      indicador.innerHTML = '<div class="flex justify-start"><div class="bg-muted rounded-2xl rounded-tl-md px-4 py-3 text-sm text-muted-foreground">Digitando...</div></div>';
      messagesContainer.appendChild(indicador);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    (window as any).getIntelligentFallback = function(userMessage: string) {
      const lowerMessage = userMessage.toLowerCase();

      if (lowerMessage.includes('preço') || lowerMessage.includes('valor') || lowerMessage.includes('custa')) {
        return 'Nossos valores variam conforme o tratamento escolhido. O ideal é agendar uma avaliação para um orçamento preciso. Gostaria de agendar?';
      } else if (lowerMessage.includes('agendar') || lowerMessage.includes('consulta') || lowerMessage.includes('marcar')) {
        return 'Para agendar, é só preencher o formulário de agendamento aqui no chat. É rápido!';
      } else if (lowerMessage.includes('tratamento') || lowerMessage.includes('facial') || lowerMessage.includes('laser') || lowerMessage.includes('corporal')) {
        return 'Temos excelentes opções de tratamentos! Você está interessada em tratamentos faciais, corporais ou com laser?';
      } else if (lowerMessage.includes('oi') || lowerMessage.includes('olá') || lowerMessage.includes('hello')) {
        return 'Olá! É um prazer falar com você. Como posso ajudá-la hoje?';
      } else if (lowerMessage.includes('horário') || lowerMessage.includes('funcionamento') || lowerMessage.includes('aberto')) {
        return 'Funcionamos de segunda a sábado, das 8h às 14h (domingo fechado). Use o botão Agendar horário para escolher o seu horário!';
      } else if (lowerMessage.includes('localização') || lowerMessage.includes('endereço') || lowerMessage.includes('onde')) {
        return 'Estamos na Rua dos Ipês, 245 – Sala 302, Funcionários, Belo Horizonte – MG.\n\nPara rotas, abra o Google Maps ou Waze e cole o endereço acima.';
      } else {
        return 'Parece que estamos com instabilidade na conexão no momento. Por favor, tente novamente em alguns instantes ou entre em contato pelo nosso WhatsApp.';
      }
    };

    (window as any).addMessageToChat = function(message: string, sender: 'user' | 'bot' | 'system') {
      const esc = (s: string) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[ch]);
      const formatar = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

      // O assistente escreve [[AGENDAR]] quando o cliente quer agendar: abrimos o formulário.
      let abrirFormulario = false;
      if (sender === 'bot' && String(message).includes('[[AGENDAR]]')) {
        abrirFormulario = true;
        message = String(message).replace(/\s*\[\[AGENDAR\]\]\s*/g, ' ').trim();
        if (!message) message = 'Claro! Preencha o formulário abaixo para escolher o seu horário. 😊';
      }

      // Tira o "Digitando..." quando chega qualquer resposta
      if (sender !== 'user') document.getElementById('typing-indicator')?.remove();

      if (sender === 'user' || sender === 'bot') {
        (window as any).chatHistory = (window as any).chatHistory || [];
        (window as any).chatHistory.push({ role: sender, text: String(message).replace(/<[^>]*>/g, '').slice(0, 800) });
      }
      const chatInterface = document.getElementById('chat-interface');
      const messagesContainer = document.getElementById('chat-messages');

      // Limpar o spinner do chat-interface na primeira mensagem
      if (chatInterface && chatInterface.innerHTML.includes('Carregando')) {
        chatInterface.innerHTML = '';
      }

      if (!messagesContainer) return;

      const messageElement = document.createElement('div');
      const timestamp = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });

      if (sender === 'user') {
        messageElement.innerHTML = `
          <div class="flex justify-end">
            <div class="bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 py-3 max-w-[80%]">
              <p class="text-sm">${formatar(message)}</p>
              <span class="text-xs opacity-70 mt-1 block">${timestamp}</span>
            </div>
          </div>
        `;
      } else if (sender === 'bot') {
        messageElement.innerHTML = `
          <div class="flex justify-start">
            <div class="bg-muted rounded-2xl rounded-tl-md px-4 py-3 max-w-[80%]">
              <p class="text-sm">${formatar(message)}</p>
              <span class="text-xs text-muted-foreground mt-1 block">${timestamp}</span>
            </div>
          </div>
        `;
      } else {
        messageElement.innerHTML = `
          <div class="flex justify-center">
            <div class="text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1">
              ${esc(message)}
            </div>
          </div>
        `;
      }

      messagesContainer.appendChild(messageElement);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      if (abrirFormulario) setTimeout(() => (window as any).openBookingForm(), 250);
    };  }, []);

  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-foreground/40"></div>
        </div>
        
        <div className="relative z-10 text-center text-white px-4 max-w-4xl mx-auto">
          <h1 className="font-serif text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Descubra sua
            <span className="block text-secondary"> Essência Natural</span>
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-2xl mx-auto leading-relaxed">
            Transforme sua pele com tratamentos personalizados e tecnologia de ponta 
            em um ambiente sofisticado e acolhedor
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              variant="luxury" 
              size="xl"
              className="group"
              onClick={() => document.getElementById('n8n-chat-container')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <span className="flex items-center gap-2">
                Descobrir Meu Tratamento
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-all" />
              </span>
            </Button>
            <Button variant="outline" size="xl" className="border-white/80 bg-white/10 text-white backdrop-blur-sm hover:bg-white hover:text-foreground">
              Conhecer Tratamentos
            </Button>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-serif text-4xl font-semibold mb-4">Por que escolher a Essência?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Combinamos expertise técnica, tecnologia avançada e cuidado personalizado 
              para entregar resultados excepcionais
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-8 bg-card rounded-2xl shadow-soft">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-serif text-xl font-semibold mb-4">Atendimento Personalizado</h3>
              <p className="text-muted-foreground">
                Cada tratamento é desenvolvido especificamente para suas necessidades e objetivos únicos
              </p>
            </div>

            <div className="text-center p-8 bg-card rounded-2xl shadow-soft">
              <div className="w-16 h-16 bg-luxury/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Star className="w-8 h-8 text-luxury" />
              </div>
              <h3 className="font-serif text-xl font-semibold mb-4">Tecnologia Avançada</h3>
              <p className="text-muted-foreground">
                Equipamentos de última geração para tratamentos eficazes e seguros
              </p>
            </div>

            <div className="text-center p-8 bg-card rounded-2xl shadow-soft">
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-8 h-8 text-accent" />
              </div>
              <h3 className="font-serif text-xl font-semibold mb-4">Resultados Comprovados</h3>
              <p className="text-muted-foreground">
                Milhares de clientes satisfeitos com transformações reais e duradouras
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Intelligent Consultation Section */}
      <section id="consultoria" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-serif text-4xl font-semibold mb-4">Descubra seu Tratamento Ideal</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Nossa consultoria inteligente personalizada vai te ajudar a encontrar o tratamento perfeito para suas necessidades
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="bg-card rounded-3xl shadow-soft p-8 md:p-12">
              <div id="n8n-chat-container" className="min-h-[500px]">
                {/* N8N Chat Integration */}
                <div id="chat-interface" className="space-y-6">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Sparkles className="w-10 h-10 text-primary" />
                    </div>
                    <h3 className="font-serif text-2xl font-semibold mb-4">Vamos começar sua jornada!</h3>
                    <p className="text-muted-foreground mb-8">
                      Responda algumas perguntas para descobrirmos o tratamento ideal para você
                    </p>
                    <button
                      id="start-consultation"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 rounded-2xl font-semibold transition-all hover:shadow-lg"
                      onClick={() => (window as any).initializeChat()}
                    >
                      Iniciar Consultoria
                    </button>
                  </div>
                </div>

                {/* Chat Messages Container */}
                <div id="chat-messages" className="hidden space-y-4 max-h-[70vh] overflow-y-auto pr-1"></div>

                {/* Message Input */}
                <div id="message-input-container" className="hidden">
                  <div className="flex gap-3 mt-6">
                    <input
                      id="message-input"
                      type="text"
                      placeholder="Digite sua mensagem..."
                      className="flex-1 px-4 py-3 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      onKeyPress={(e) => e.key === 'Enter' && (window as any).sendMessage()}
                    />
                    <button
                      id="send-button"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-2xl font-semibold transition-all hover:shadow-lg"
                      onClick={() => (window as any).sendMessage()}
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Treatments Preview */}
      <section id="tratamentos" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-serif text-4xl font-semibold mb-4">Nossos Tratamentos</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Soluções completas para cuidar da sua pele com excelência e sofisticação
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="group cursor-pointer">
              <div className="relative overflow-hidden rounded-2xl mb-6">
                <img src={facialImage} alt="Tratamentos Faciais" className="w-full h-64 object-cover group-hover:scale-105 transition-all duration-500" />
                <div className="absolute inset-0 bg-foreground/20 group-hover:bg-foreground/40 transition-all"></div>
              </div>
              <h3 className="font-serif text-2xl font-semibold mb-3">Tratamentos Faciais</h3>
              <p className="text-muted-foreground mb-4">Rejuvenescimento, hidratação e tratamento de imperfeições para uma pele radiante</p>
              <Button variant="ghost" className="group-hover:text-primary">
                Saiba mais <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="group cursor-pointer">
              <div className="relative overflow-hidden rounded-2xl mb-6">
                <img src={bodyImage} alt="Tratamentos Corporais" className="w-full h-64 object-cover group-hover:scale-105 transition-all duration-500" />
                <div className="absolute inset-0 bg-foreground/20 group-hover:bg-foreground/40 transition-all"></div>
              </div>
              <h3 className="font-serif text-2xl font-semibold mb-3">Tratamentos Corporais</h3>
              <p className="text-muted-foreground mb-4">Modelagem corporal, redução de medidas e melhora da textura da pele</p>
              <Button variant="ghost" className="group-hover:text-primary">
                Saiba mais <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="group cursor-pointer">
              <div className="relative overflow-hidden rounded-2xl mb-6">
                <img src={laserImage} alt="Laser e Tecnologia" className="w-full h-64 object-cover group-hover:scale-105 transition-all duration-500" />
                <div className="absolute inset-0 bg-foreground/20 group-hover:bg-foreground/40 transition-all"></div>
              </div>
              <h3 className="font-serif text-2xl font-semibold mb-3">Laser e Tecnologia</h3>
              <p className="text-muted-foreground mb-4">Tratamentos avançados com laser para resultados precisos e eficazes</p>
              <Button variant="ghost" className="group-hover:text-primary">
                Saiba mais <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button variant="luxury" size="lg">
              Ver Todos os Tratamentos
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 gradient-nude">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-4xl font-semibold mb-6">
            Pronta para transformar sua pele?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Descubra qual tratamento é ideal para você através da nossa jornada personalizada
          </p>
          <Button
            variant="luxury"
            size="xl"
            className="group"
            onClick={() => document.getElementById('n8n-chat-container')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <span className="flex items-center gap-2">
              Descobrir Meu Tratamento Ideal
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-all" />
            </span>
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;


