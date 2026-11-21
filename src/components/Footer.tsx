import { Phone, Instagram, MapPin, Mail, Clock } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-foreground text-background py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <h3 className="font-serif text-3xl font-bold text-secondary mb-4">
              Essência da Pele
            </h3>
            <p className="text-background/80 mb-6 max-w-md">
              Transformando vidas através do cuidado especializado com a pele. 
              Descubra sua essência e revele sua beleza natural conosco.
            </p>
            <div className="flex space-x-4">
              <a
                href="#"
                className="w-10 h-10 bg-secondary/20 rounded-full flex items-center justify-center hover:bg-secondary/30 transition-colors"
              >
                <Instagram className="w-5 h-5 text-secondary" />
              </a>
              <a
                href="#"
                className="w-10 h-10 bg-secondary/20 rounded-full flex items-center justify-center hover:bg-secondary/30 transition-colors"
              >
                <Phone className="w-5 h-5 text-secondary" />
              </a>
            </div>
          </div>

          {/* Contato */}
          <div>
            <h4 className="font-semibold text-lg mb-4 text-secondary">
              Contato
            </h4>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Phone className="w-4 h-4 text-secondary" />
                <span className="text-background/80">(11) 9999-9999</span>
              </div>
              <div className="flex items-center space-x-3">
                <Mail className="w-4 h-4 text-secondary" />
                <span className="text-background/80">contato@essenciadapele.com.br</span>
              </div>
              <div className="flex items-start space-x-3">
                <MapPin className="w-4 h-4 text-secondary mt-1" />
                <span className="text-background/80">
                  Rua da Beleza, 123<br />
                  Jardim Estético, SP
                </span>
              </div>
            </div>
          </div>

          {/* Horário */}
          <div>
            <h4 className="font-semibold text-lg mb-4 text-secondary">
              Funcionamento
            </h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <Clock className="w-4 h-4 text-secondary" />
                <div>
                  <div className="text-background/80">Seg - Sex</div>
                  <div className="text-background/60 text-sm">9h às 18h</div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-4"></div>
                <div>
                  <div className="text-background/80">Sábado</div>
                  <div className="text-background/60 text-sm">9h às 14h</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-background/20 mt-12 pt-8 text-center">
          <p className="text-background/60">
            © 2024 Essência da Pele. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;