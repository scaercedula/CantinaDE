import React, { useState, useEffect } from 'react';
import { MensagemChatDecifrada, Usuario, PerfilUsuario } from '../types';
import { chatService } from '../services/chatService';
import { Icons } from './Icons';

interface ChatToastNotificationProps {
  usuarioAtual: Usuario;
  onAbrirChat?: (cadeteId?: string) => void;
}

export const ChatToastNotification: React.FC<ChatToastNotificationProps> = ({ usuarioAtual, onAbrirChat }) => {
  const [toast, setToast] = useState<MensagemChatDecifrada | null>(null);

  useEffect(() => {
    const unsub = chatService.subscreverNotificacoesGlobais((msg) => {
      // Exibe apenas se a mensagem foi enviada por outra pessoa
      if (msg.remetenteId !== usuarioAtual.id) {
        const isDestinadoAUsuario =
          (usuarioAtual.perfil === PerfilUsuario.CADETE && msg.destinatarioId === usuarioAtual.id) ||
          (usuarioAtual.perfil === PerfilUsuario.CANTINA && msg.destinatarioId === 'cantina');

        if (isDestinadoAUsuario) {
          setToast(msg);
          // Fecha automaticamente após 6 segundos
          const timer = setTimeout(() => {
            setToast(null);
          }, 6000);
          return () => clearTimeout(timer);
        }
      }
    });

    return () => unsub();
  }, [usuarioAtual]);

  if (!toast) return null;

  const cadeteIdAlvo = toast.canalId.replace('chat_', '');

  return (
    <div className="fixed top-20 right-4 sm:right-6 z-50 max-w-sm w-[calc(100vw-2rem)] animate-slide-down">
      <div className="bg-white/95 backdrop-blur-md border border-gray-100 shadow-2xl rounded-2xl p-4 flex items-start gap-3 ring-1 ring-black/5">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm font-bold">
          <Icons.Chat className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs sm:text-sm text-gray-900 truncate">
              {toast.remetenteNome}
            </h4>
            <span className="text-[10px] text-gray-400">Agora</span>
          </div>
          <p className="text-xs text-gray-600 truncate mt-0.5">
            {toast.texto}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setToast(null);
                if (onAbrirChat) onAbrirChat(cadeteIdAlvo);
              }}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-lg transition-colors"
            >
              Responder
            </button>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              Ignorar
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setToast(null)}
          className="text-gray-400 hover:text-gray-600 p-1 -mr-1 -mt-1"
        >
          <Icons.X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
