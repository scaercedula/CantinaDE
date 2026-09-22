import React, { useState, useEffect } from 'react';
import { Icons } from './Icons';

interface WhatsNewCardProps {
  onOpenChat?: () => void;
}

const STORAGE_KEY = 'cantina_whats_new_chat_dismissed_v1';

export const WhatsNewCard: React.FC<WhatsNewCardProps> = ({ onOpenChat }) => {
  const [isDismissed, setIsDismissed] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setIsDismissed(false);
        setIsExpanded(true);
      }
    } catch {
      setIsDismissed(false);
      setIsExpanded(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsExpanded(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (e) {
      console.warn('Erro ao salvar no localStorage:', e);
    }
  };

  const handleOpenChatAction = () => {
    if (onOpenChat) {
      onOpenChat();
    } else {
      window.dispatchEvent(new CustomEvent('abrir-chat-cadete'));
    }
  };

  // Se minimizado, exibe um botão/badge discreto para que o usuário possa reabrir as novidades
  if (isDismissed && !isExpanded) {
    return (
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200/80 shadow-xs transition-all active:scale-95"
        >
          <span>✨</span>
          <span>O que há de novo (Chat & Salgadada)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 bg-gradient-to-br from-white via-emerald-50/30 to-teal-50/40 rounded-3xl border border-emerald-200/90 shadow-xl overflow-hidden animate-fade-in relative">
      {/* Barra superior decorativa */}
      <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-400" />

      <div className="p-5 sm:p-7">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-emerald-100/70">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center text-2xl shadow-md ring-4 ring-emerald-100 shrink-0">
              ✨
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider font-extrabold bg-emerald-600 text-white px-2.5 py-0.5 rounded-full shadow-2xs">
                  Atualização do Sistema
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  Versão 2.0
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
                O que há de novo (What's New)
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-700 p-2 hover:bg-emerald-100/50 rounded-full transition-all"
            title="Fechar novidades"
          >
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Grade de Novidades */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Card 1: Chat em Tempo Real */}
          <div className="bg-white/85 backdrop-blur-xs rounded-2xl p-5 border border-emerald-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Icons.Chat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 leading-tight">
                    Chat em Tempo Real & Criptografia E2EE
                  </h3>
                  <p className="text-xs text-emerald-700 font-semibold">Comunicação direta com a Cantina</p>
                </div>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed mb-3">
                Agora você pode conversar diretamente com o perfil da Cantina da D.E através do botão flutuante no canto inferior da tela.
              </p>

              <ul className="space-y-2 text-xs text-gray-700">
                <li className="flex items-start gap-2">
                  <Icons.Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Criptografia de Ponta a Ponta:</strong> Suas conversas utilizam cifra militar <strong>AES-256</strong>. Nem o banco de dados tem acesso ao texto puro das suas mensagens.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Icons.Bell className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Notificações Inteligentes:</strong> Avisos sonoros suaves sintetizados e alertas em tela sempre que uma nova resposta chegar.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Icons.Search className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Busca no Histórico & Leitura:</strong> Pesquise mensagens anteriores e acompanhe se foram entregues e lidas (<Icons.CheckCheck className="w-3.5 h-3.5 text-sky-500 inline" />).
                  </span>
                </li>
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] text-gray-400 font-medium">Acesso rápido no canto direito</span>
              <button
                type="button"
                onClick={handleOpenChatAction}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 rounded-xl shadow-xs transition-all active:scale-95"
              >
                <Icons.Chat className="w-3.5 h-3.5" />
                Abrir Chat
              </button>
            </div>
          </div>

          {/* Card 2: Como Funciona o Chat da Salgadada */}
          <div className="bg-white/85 backdrop-blur-xs rounded-2xl p-5 border border-amber-200/70 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl text-lg">
                  🥪
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 leading-tight">
                    Como Funciona o Chat da Salgadada
                  </h3>
                  <p className="text-xs text-amber-700 font-semibold">Tudo sobre pedidos de eventos & cotas</p>
                </div>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed mb-3">
                O chat foi integrado para facilitar a coordenação dos eventos de salgadada e rateios de esquadrão:
              </p>

              <div className="space-y-2.5 text-xs text-gray-700">
                <div className="flex items-start gap-2 bg-amber-50/60 p-2.5 rounded-xl border border-amber-100">
                  <span className="font-bold text-amber-700 shrink-0">1.</span>
                  <p>
                    <strong>Mencione o Pedido do Evento:</strong> Ao abrir o chat, utilize o botão <em>"Mencionar no Chat"</em> para anexar automaticamente o resumo da salgadada que você organizou.
                  </p>
                </div>

                <div className="flex items-start gap-2 bg-amber-50/60 p-2.5 rounded-xl border border-amber-100">
                  <span className="font-bold text-amber-700 shrink-0">2.</span>
                  <p>
                    <strong>Alinhamento de Horários e Sabores:</strong> Combine o horário exato da fornada para que os salgados saiam quentinhos na hora do intervalo ou evento do esquadrão.
                  </p>
                </div>

                <div className="flex items-start gap-2 bg-amber-50/60 p-2.5 rounded-xl border border-amber-100">
                  <span className="font-bold text-amber-700 shrink-0">3.</span>
                  <p>
                    <strong>Avisos de Preparo e Balcão:</strong> A equipe da Cantina envia atualizações de status quando os centos entram no forno e quando a salgadada estiver pronta para retirada!
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] text-gray-400 font-medium">Sincronização instantânea</span>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs font-bold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
              >
                Entendi, dispensar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
