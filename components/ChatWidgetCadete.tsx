import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Usuario, Pedido, MensagemChatDecifrada, PedidoVinculadoChat } from '../types';
import { chatService } from '../services/chatService';
import { Icons } from './Icons';
import { requestNotificationPermission } from '../services/soundNotification';

interface ChatWidgetCadeteProps {
  usuario: Usuario;
  ultimoPedido?: Pedido;
}

export const ChatWidgetCadete: React.FC<ChatWidgetCadeteProps> = ({ usuario, ultimoPedido }) => {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mensagens, setMensagens] = useState<MensagemChatDecifrada[]>([]);
  const [novoTexto, setNovoTexto] = useState('');
  const [naoLidas, setNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [buscaTermo, setBuscaTermo] = useState('');
  const [exibirBusca, setExibirBusca] = useState(false);
  const [notificacoesAtivas, setNotificacoesAtivas] = useState(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Carrega contagem inicial de não lidas e escuta atualizações com polling de garantia
  useEffect(() => {
    let cancelado = false;
    const atualizarNaoLidas = async () => {
      if (!isOpen && !cancelado) {
        const count = await chatService.getQtdNaoLidasCadete(usuario.id);
        if (!cancelado) setNaoLidas(count);
      }
    };

    atualizarNaoLidas();
    const unsubUnread = chatService.subscreverMudancaNaoLidas(atualizarNaoLidas);
    const interval = setInterval(atualizarNaoLidas, 5000);

    return () => {
      cancelado = true;
      unsubUnread();
      clearInterval(interval);
    };
  }, [usuario.id, isOpen]);

  // Permite abrir o chat programaticamente (ex: pelo card de novidades)
  useEffect(() => {
    const handleAbrir = () => {
      setIsOpen(true);
      setNaoLidas(0);
    };
    window.addEventListener('abrir-chat-cadete', handleAbrir);
    return () => window.removeEventListener('abrir-chat-cadete', handleAbrir);
  }, []);

  // Carrega mensagens, inscreve no canal e ativa polling de garantia a cada 3s quando aberto
  useEffect(() => {
    if (!isOpen) return;

    let cancelado = false;
    setCarregando(true);

    const carregar = async (silent = false) => {
      try {
        const msgs = await chatService.buscarMensagens(usuario.id, usuario);
        if (cancelado) return;

        setMensagens(prev => {
          if (prev.length === msgs.length) {
            const lastPrev = prev[prev.length - 1];
            const lastNew = msgs[msgs.length - 1];
            if (lastPrev?.id === lastNew?.id && lastPrev?.lida === lastNew?.lida) {
              return prev;
            }
          }
          return msgs;
        });

        if (!silent) setCarregando(false);
        chatService.marcarComoLidas(usuario.id, usuario);
        setNaoLidas(0);
      } catch (err) {
        if (!silent) setCarregando(false);
      }
    };

    carregar(false);

    // Subscrição em tempo real via SSE / BroadcastChannel
    const unsubCanal = chatService.subscreverCanal(usuario.id, (novaMsg) => {
      setMensagens(prev => {
        if (prev.some(m => m.id === novaMsg.id)) return prev;
        return [...prev, novaMsg];
      });
      if (isOpen) {
        chatService.marcarComoLidas(usuario.id, usuario);
      }
    });

    // Polling de garantia (every 3 seconds) para sincronização contínua
    const interval = setInterval(() => {
      carregar(true);
    }, 3000);

    return () => {
      cancelado = true;
      unsubCanal();
      clearInterval(interval);
    };
  }, [isOpen, usuario]);

  // Auto-scroll ao receber novas mensagens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensagens, isOpen]);

  const handleEnviar = async (e?: React.FormEvent, pedidoAnexo?: PedidoVinculadoChat) => {
    if (e) e.preventDefault();
    const texto = novoTexto.trim();
    if (!texto && !pedidoAnexo) return;

    setEnviando(true);
    setNovoTexto('');
    try {
      const msgEnviada = await chatService.enviarMensagem(
        usuario,
        usuario.id,
        texto || 'Informações sobre o pedido',
        pedidoAnexo
      );
      setMensagens(prev => [...prev.filter(m => m.id !== msgEnviada.id), msgEnviada]);
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    } finally {
      setEnviando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleAnexarUltimoPedido = () => {
    if (!ultimoPedido) return;
    const resumoItens = ultimoPedido.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ');
    const pedidoAnexo: PedidoVinculadoChat = {
      id: ultimoPedido.id,
      data: ultimoPedido.data,
      valorTotal: ultimoPedido.valorTotal,
      itensResumo: resumoItens,
      status: ultimoPedido.status
    };
    handleEnviar(undefined, pedidoAnexo);
  };

  const handleToggleNotificacoes = async () => {
    const granted = await requestNotificationPermission();
    setNotificacoesAtivas(granted);
  };

  // Filtro de pesquisa de mensagens
  const mensagensFiltradas = mensagens.filter(m => {
    if (!buscaTermo.trim()) return true;
    const termo = buscaTermo.toLowerCase();
    const textoMatch = m.texto.toLowerCase().includes(termo);
    const pedidoMatch = m.pedidoVinculado?.itensResumo.toLowerCase().includes(termo);
    return textoMatch || pedidoMatch;
  });

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Botão Flutuante (FAB) - 100% fixo no canto inferior direito da janela */}
      <div className="fixed bottom-6 right-6 z-50 pointer-events-auto">
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) setNaoLidas(0);
          }}
          className={`relative flex items-center gap-2.5 px-4 py-3.5 rounded-full shadow-2xl transition-all duration-300 transform active:scale-95 ${
            isOpen 
              ? 'bg-gray-900 text-white ring-4 ring-gray-200' 
              : 'bg-emerald-600 hover:bg-emerald-700 text-white ring-4 ring-emerald-100 hover:shadow-emerald-500/25'
          }`}
          aria-label="Abrir chat com a Cantina"
        >
          {isOpen ? (
            <Icons.X className="w-6 h-6 animate-spin-once" />
          ) : (
            <>
              <Icons.Chat className="w-6 h-6" />
              <span className="font-bold text-sm hidden sm:inline">Falar com a Cantina</span>
            </>
          )}

          {naoLidas > 0 && !isOpen && (
            <span className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white ring-2 ring-white animate-bounce shadow-md">
              {naoLidas > 9 ? '9+' : naoLidas}
            </span>
          )}
        </button>
      </div>

      {/* Janela Modal do Chat - 100% fixa e responsiva */}
      {isOpen && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[420px] max-h-[640px] h-[82vh] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-fade-in transition-all">
          {/* Topo / Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-4 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-lg border border-white/30">
                  🥪
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full ring-2 ring-emerald-700 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base leading-tight flex items-center gap-1.5">
                  Cantina da DE
                  <span className="text-[10px] bg-emerald-800/80 px-2 py-0.5 rounded-full font-medium text-emerald-100">
                    Oficial
                  </span>
                </h3>
                <p className="text-xs text-emerald-100 flex items-center gap-1 mt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300"></span>
                  Atendimento em tempo real
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExibirBusca(!exibirBusca)}
                title="Pesquisar mensagens"
                className={`p-2 rounded-full transition-colors ${exibirBusca ? 'bg-white/30 text-white' : 'hover:bg-white/10 text-emerald-100'}`}
              >
                <Icons.Search className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleToggleNotificacoes}
                title={notificacoesAtivas ? 'Notificações ativadas' : 'Ativar notificações'}
                className={`p-2 rounded-full transition-colors ${notificacoesAtivas ? 'text-amber-300' : 'hover:bg-white/10 text-emerald-100'}`}
              >
                <Icons.Bell className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-emerald-100 hover:text-white"
                title="Fechar"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Barra de Pesquisa Interna */}
          {exibirBusca && (
            <div className="p-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2 animate-slide-down">
              <Icons.Search className="w-4 h-4 text-gray-400 ml-1" />
              <input
                type="text"
                value={buscaTermo}
                onChange={(e) => setBuscaTermo(e.target.value)}
                placeholder="Pesquisar conversa..."
                className="flex-1 text-xs bg-transparent border-none focus:outline-none text-gray-800 placeholder-gray-400"
                autoFocus
              />
              {buscaTermo && (
                <button
                  type="button"
                  onClick={() => setBuscaTermo('')}
                  className="text-xs text-gray-400 hover:text-gray-600 p-1"
                >
                  <Icons.X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Banner de Segurança E2EE */}
          <div className="bg-emerald-50/70 border-b border-emerald-100/60 px-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-emerald-800 font-medium">
            <Icons.Lock className="w-3 h-3 text-emerald-600" />
            <span>Criptografia de ponta a ponta (AES-256)</span>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50/50 to-white">
            {carregando ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs py-8">
                <Icons.Refresh className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
                <span>Carregando mensagens com segurança...</span>
              </div>
            ) : mensagensFiltradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-gray-400 space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl mb-1">
                  💬
                </div>
                <p className="font-bold text-gray-700 text-sm">Nenhuma mensagem ainda</p>
                <p className="text-xs text-gray-500 leading-relaxed max-w-xs">
                  Envie uma dúvida sobre o cardápio, combine horários da fornada da salgadada ou consulte seu pedido!
                </p>
              </div>
            ) : (
              mensagensFiltradas.map((msg) => {
                const isMinha = msg.isMinha;
                const horaFormatada = new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMinha ? 'items-end' : 'items-start'} animate-fade-in`}
                  >
                    {!isMinha && (
                      <span className="text-[10px] text-gray-500 font-semibold mb-1 ml-1 flex items-center gap-1">
                        <span>🥪</span> Cantina da DE
                      </span>
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-xs text-xs ${
                        isMinha
                          ? 'bg-emerald-600 text-white rounded-br-xs'
                          : 'bg-white border border-gray-200 text-gray-900 rounded-bl-xs shadow-sm'
                      }`}
                    >
                      {/* Pedido Vinculado / Anexado */}
                      {msg.pedidoVinculado && (
                        <div
                          className={`mb-2 p-2 rounded-xl border text-[11px] ${
                            isMinha
                              ? 'bg-emerald-700/60 border-emerald-500/60 text-white'
                              : 'bg-gray-50 border-gray-200 text-gray-800'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold mb-1">
                            <span className="flex items-center gap-1">
                              <Icons.ShoppingBag className="w-3.5 h-3.5" />
                              Pedido #{msg.pedidoVinculado.id.slice(-5)}
                            </span>
                            <span>R$ {Number(msg.pedidoVinculado.valorTotal).toFixed(2)}</span>
                          </div>
                          <p className={`line-clamp-2 ${isMinha ? 'text-emerald-100' : 'text-gray-600'}`}>
                            {msg.pedidoVinculado.itensResumo}
                          </p>
                          <div className="mt-1 flex items-center justify-between text-[10px] font-semibold">
                            <span>Status: {msg.pedidoVinculado.status}</span>
                            <span>{new Date(msg.pedidoVinculado.data).toLocaleDateString()}</span>
                          </div>
                        </div>
                      )}

                      {/* Texto da Mensagem */}
                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                        {msg.texto}
                      </p>

                      {/* Rodapé da Bolha */}
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                          isMinha ? 'text-emerald-200' : 'text-gray-400'
                        }`}
                      >
                        <span>{horaFormatada}</span>
                        {isMinha && (
                          <span>
                            {msg.lida ? (
                              <Icons.CheckCheck className="w-3.5 h-3.5 text-sky-300 inline" />
                            ) : (
                              <Icons.Check className="w-3.5 h-3.5 inline" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Atalho de Anexar Último Pedido */}
          {ultimoPedido && (
            <div className="px-3 pt-2 pb-1 bg-white border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span className="truncate pr-2 text-[11px]">
                Último pedido: #{ultimoPedido.id.slice(-4)} (R$ {Number(ultimoPedido.valorTotal).toFixed(2)})
              </span>
              <button
                type="button"
                onClick={handleAnexarUltimoPedido}
                disabled={enviando}
                className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
              >
                <Icons.Paperclip className="w-3 h-3" />
                Mencionar no Chat
              </button>
            </div>
          )}

          {/* Campo de Envio */}
          <form onSubmit={handleEnviar} className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={novoTexto}
              onChange={(e) => setNovoTexto(e.target.value)}
              placeholder="Digite sua mensagem..."
              className="flex-1 bg-gray-100 hover:bg-gray-50 focus:bg-white text-gray-900 px-4 py-2.5 text-sm rounded-2xl border border-transparent focus:border-emerald-500 focus:outline-none transition-all placeholder-gray-400"
              disabled={enviando}
            />
            <button
              type="submit"
              disabled={!novoTexto.trim() || enviando}
              className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white rounded-2xl transition-all shadow-md active:scale-95 disabled:shadow-none flex items-center justify-center shrink-0"
              title="Enviar mensagem"
            >
              {enviando ? (
                <Icons.Refresh className="w-5 h-5 animate-spin" />
              ) : (
                <Icons.Send className="w-5 h-5" />
              )}
            </button>
          </form>
        </div>
      )}
    </>,
    document.body
  );
};
