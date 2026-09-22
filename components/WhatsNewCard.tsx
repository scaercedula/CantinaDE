import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';

interface WhatsNewCardProps {
  onOpenChat?: () => void;
}

const SESSION_KEY = 'cantina_whats_new_session_viewed_v3';

export const WhatsNewCard: React.FC<WhatsNewCardProps> = ({ onOpenChat }) => {
  // Abre automaticamente a cada novo login / sessão até ser fechado
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const alreadySeenThisSession = sessionStorage.getItem(SESSION_KEY);
      if (!alreadySeenThisSession) {
        setIsOpen(true);
      }
    } catch {
      setIsOpen(true);
    }
  }, []);

  const handleCloseAndProceed = () => {
    setIsOpen(false);
    try {
      sessionStorage.setItem(SESSION_KEY, 'true');
    } catch (e) {
      console.warn('Erro ao salvar no sessionStorage:', e);
    }
  };

  const handleOpenChatAction = () => {
    handleCloseAndProceed();
    if (onOpenChat) {
      onOpenChat();
    } else {
      window.dispatchEvent(new CustomEvent('abrir-chat-cadete'));
    }
  };

  // Não renderiza nada se não estiver aberto ou fora do navegador
  if (!mounted || !isOpen) {
    return null;
  }

  // Renderiza diretamente no document.body para ficar 100% fixo no topo da tela do navegador
  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-2 sm:pt-4 p-2 sm:p-4 bg-gray-950/80 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="w-full max-w-2xl my-1 sm:my-2 flex flex-col bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Faixa decorativa no topo */}
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-400 shrink-0" />

        {/* Cabeçalho do Modal */}
        <div className="p-4 sm:p-6 bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-white border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center text-2xl shadow-lg ring-4 ring-emerald-100 shrink-0">
              ✨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-black bg-emerald-600 text-white px-2.5 py-0.5 rounded-full shadow-2xs">
                  Atualização Oficial
                </span>
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full">
                  Versão 2.0
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-gray-900 mt-1">
                O que há de novo (What's New)
              </h2>
            </div>
          </div>

          {/* Botão de Fechar no Topo (Super Claro) */}
          <button
            type="button"
            onClick={handleCloseAndProceed}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 font-bold text-xs rounded-xl transition-all active:scale-95 border border-gray-200"
            title="Fechar e continuar"
          >
            <span>Fechar</span>
            <Icons.X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo com Scroll Suave */}
        <div className="max-h-[60vh] overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-gray-50/50 to-white text-gray-800">
          {/* Card 1: Chat em Tempo Real */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-100 shadow-sm">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                <Icons.Chat className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-gray-900 leading-tight">
                  Chat em Tempo Real & Criptografia E2EE
                </h3>
                <p className="text-xs text-emerald-700 font-bold">Comunicação direta com a equipe da Cantina</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed mb-3">
              Agora você pode conversar diretamente com a Cantina em tempo real pelo botão flutuante no canto inferior direito.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5 mb-1">
                  <Icons.Lock className="w-3.5 h-3.5 text-emerald-600" />
                  Criptografia Militar AES-256
                </span>
                <p className="text-gray-600 text-[11px] leading-relaxed">
                  Mensagens cifradas de ponta a ponta. Nem o servidor consegue ler o conteúdo puro.
                </p>
              </div>

              <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5 mb-1">
                  <Icons.Bell className="w-3.5 h-3.5 text-emerald-600" />
                  Notificações & Leitura
                </span>
                <p className="text-gray-600 text-[11px] leading-relaxed">
                  Toques sonoros suaves e indicadores de leitura (<Icons.CheckCheck className="w-3 h-3 text-sky-500 inline" />) quando a cantina responder.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Como Funciona o Chat da Salgadada */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-amber-200/80 shadow-sm">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-xl text-lg">
                🥪
              </div>
              <div>
                <h3 className="font-extrabold text-base text-gray-900 leading-tight">
                  Como Funciona o Chat da Salgadada
                </h3>
                <p className="text-xs text-amber-700 font-bold">Coordenação de centos, fornadas e eventos</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed mb-3">
              Ao criar uma solicitação de salgadada para o esquadrão, você conta com o chat para:
            </p>

            <div className="space-y-2 text-xs text-gray-700">
              <div className="flex items-start gap-2.5 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100">
                <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <p>
                  <strong>Anexar o Pedido do Evento:</strong> No chat, clique no botão <em>"Mencionar no Chat"</em> para enviar instantaneamente o resumo do seu evento e cota.
                </p>
              </div>

              <div className="flex items-start gap-2.5 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100">
                <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <p>
                  <strong>Combinar Horários da Fornada:</strong> Alinhe o horário exato para que os salgados saiam quentinhos na hora certa do intervalo ou comemoração.
                </p>
              </div>

              <div className="flex items-start gap-2.5 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100">
                <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <p>
                  <strong>Avisos de Preparo e Balcão:</strong> Receba mensagens em tempo real quando os centos forem ao forno e quando estiverem prontos para retirada no balcão da DE.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com o Botão de Fechar Super Destaque */}
        <div className="p-4 sm:p-5 bg-white border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleOpenChatAction}
            className="w-full sm:w-auto px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Icons.Chat className="w-4 h-4 text-emerald-600" />
            Experimentar Chat Agora
          </button>

          <button
            type="button"
            onClick={handleCloseAndProceed}
            className="w-full sm:flex-1 py-3.5 px-6 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-sm rounded-xl shadow-lg hover:shadow-emerald-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span>Entendi e Prosseguir para a Cantina</span>
            <Icons.Check className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
