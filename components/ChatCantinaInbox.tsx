import React, { useState, useEffect, useRef } from 'react';
import { Usuario, ConversaPreview, MensagemChatDecifrada } from '../types';
import { chatService } from '../services/chatService';
import { loginAPI } from '../services/loginAPI';
import { Icons } from './Icons';
import { getEsquadrao } from '../utils';
import { requestNotificationPermission } from '../services/soundNotification';

interface ChatCantinaInboxProps {
  cadetesIniciais?: Usuario[];
}

const RESPOSTAS_RAPIDAS = [
  '⏳ Seu pedido está sendo preparado!',
  '🥪 Seu pedido está pronto para retirada no balcão!',
  '⚠️ O item solicitado acabou no momento. Deseja substituir por outro?',
  '✅ Pedido confirmado com sucesso!',
  '⭐ Obrigado e bom apetite!'
];

export const ChatCantinaInbox: React.FC<ChatCantinaInboxProps> = ({ cadetesIniciais }) => {
  const [conversas, setConversas] = useState<ConversaPreview[]>([]);
  const [cadeteAtivo, setCadeteAtivo] = useState<Usuario | null>(null);
  const [mensagens, setMensagens] = useState<MensagemChatDecifrada[]>([]);
  const [novoTexto, setNovoTexto] = useState('');
  const [filtroCadete, setFiltroCadete] = useState('');
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false);
  const [buscaNaConversa, setBuscaNaConversa] = useState('');
  const [exibirBuscaConversa, setExibirBuscaConversa] = useState(false);
  const [carregandoConversas, setCarregandoConversas] = useState(false);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [notificacoesAtivas, setNotificacoesAtivas] = useState(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carrega lista de cadetes e histórico das conversas
  const carregarTodasConversas = async () => {
    setCarregandoConversas(true);
    try {
      let cadetes = cadetesIniciais;
      if (!cadetes || cadetes.length === 0) {
        cadetes = await loginAPI.getCadetes();
      }
      if (cadetes) {
        const previews = await chatService.getConversasCantina(cadetes);
        setConversas(previews);

        // Se nenhum cadete estiver selecionado, seleciona o primeiro que tiver mensagens
        if (!cadeteAtivo && previews.length > 0) {
          const primeiroComMensagem = previews.find(p => p.ultimaMensagem);
          if (primeiroComMensagem) {
            setCadeteAtivo(primeiroComMensagem.cadete);
          } else {
            setCadeteAtivo(previews[0].cadete);
          }
        }
      }
    } catch (e) {
      console.error('Erro ao carregar conversas da cantina:', e);
    } finally {
      setCarregandoConversas(false);
    }
  };

  useEffect(() => {
    carregarTodasConversas();

    // Escuta novas mensagens globais para reordenar a lista e atualizar prévias
    const unsubGlobal = chatService.subscreverNotificacoesGlobais(async (msg) => {
      setConversas(prev => {
        return prev.map(c => {
          if (c.canalId === msg.canalId) {
            const novaQtd = (c.cadete.id === cadeteAtivo?.id) ? 0 : c.naoLidas + 1;
            return {
              ...c,
              ultimaMensagem: msg,
              atualizadoEm: msg.timestamp,
              naoLidas: novaQtd
            };
          }
          return c;
        }).sort((a, b) => new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime());
      });
    });

    const unsubUnread = chatService.subscreverMudancaNaoLidas(() => {
      // Atualiza lista levemente
      if (cadetesIniciais) {
        chatService.getConversasCantina(cadetesIniciais).then(setConversas);
      }
    });

    return () => {
      unsubGlobal();
      unsubUnread();
    };
  }, [cadeteAtivo]);

  // Carrega mensagens do cadete ativo
  useEffect(() => {
    if (!cadeteAtivo) return;

    setCarregandoMensagens(true);
    const usuarioAtual = loginAPI.getUsuarioAtual() || {
      id: 'cantina',
      perfil: 'CANTINA',
      nomeCompleto: 'Cantina',
      nomeDeGuerra: 'Cantina',
      email: '',
      numero: ''
    } as any;

    chatService.buscarMensagens(cadeteAtivo.id, usuarioAtual).then(msgs => {
      setMensagens(msgs);
      setCarregandoMensagens(false);
      chatService.marcarComoLidas(cadeteAtivo.id, usuarioAtual);

      // Zera contador na lista local
      setConversas(prev => prev.map(c => c.cadete.id === cadeteAtivo.id ? { ...c, naoLidas: 0 } : c));
    });

    const unsubCanal = chatService.subscreverCanal(cadeteAtivo.id, (novaMsg) => {
      setMensagens(prev => {
        if (prev.some(m => m.id === novaMsg.id)) return prev;
        return [...prev, novaMsg];
      });
      chatService.marcarComoLidas(cadeteAtivo.id, usuarioAtual);
      setConversas(prev => prev.map(c => c.cadete.id === cadeteAtivo.id ? { ...c, naoLidas: 0 } : c));
    });

    return () => unsubCanal();
  }, [cadeteAtivo]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  const handleEnviar = async (e?: React.FormEvent, textoCustomizado?: string) => {
    if (e) e.preventDefault();
    if (!cadeteAtivo) return;

    const texto = (textoCustomizado || novoTexto).trim();
    if (!texto) return;

    setEnviando(true);
    setNovoTexto('');

    const usuarioAtual = loginAPI.getUsuarioAtual() || {
      id: 'cantina',
      perfil: 'CANTINA',
      nomeCompleto: 'Cantina da DE',
      nomeDeGuerra: 'Cantina',
      email: '',
      numero: ''
    } as any;

    try {
      const msgEnviada = await chatService.enviarMensagem(
        usuarioAtual,
        cadeteAtivo.id,
        texto
      );
      setMensagens(prev => [...prev.filter(m => m.id !== msgEnviada.id), msgEnviada]);

      // Atualiza última mensagem na conversa
      setConversas(prev => prev.map(c => {
        if (c.cadete.id === cadeteAtivo.id) {
          return {
            ...c,
            ultimaMensagem: msgEnviada,
            atualizadoEm: msgEnviada.timestamp
          };
        }
        return c;
      }));
    } catch (err) {
      console.error('Erro ao responder cadete:', err);
    } finally {
      setEnviando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleToggleNotificacoes = async () => {
    const granted = await requestNotificationPermission();
    setNotificacoesAtivas(granted);
  };

  // Filtragem dos Cadetes na Coluna Esquerda
  const conversasFiltradas = conversas.filter(conv => {
    if (apenasNaoLidas && conv.naoLidas === 0) return false;
    if (!filtroCadete.trim()) return true;

    const termo = filtroCadete.toLowerCase();
    const nomeMatch = conv.cadete.nomeCompleto.toLowerCase().includes(termo);
    const guerraMatch = conv.cadete.nomeDeGuerra.toLowerCase().includes(termo);
    const numeroMatch = conv.cadete.numero.includes(termo);
    const esquadraoMatch = getEsquadrao(conv.cadete.numero).toLowerCase().includes(termo);

    return nomeMatch || guerraMatch || numeroMatch || esquadraoMatch;
  });

  // Filtragem de Mensagens na Janela Ativa
  const mensagensFiltradas = mensagens.filter(m => {
    if (!buscaNaConversa.trim()) return true;
    const termo = buscaNaConversa.toLowerCase();
    return m.texto.toLowerCase().includes(termo) || m.pedidoVinculado?.itensResumo.toLowerCase().includes(termo);
  });

  const totalNaoLidasGeral = conversas.reduce((acc, c) => acc + c.naoLidas, 0);

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col md:flex-row h-[750px] max-h-[82vh] overflow-hidden">
      {/* ================= COLUNA ESQUERDA: INBOX / LISTA DE CADETES ================= */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-gray-100 flex flex-col bg-gray-50/50 ${cadeteAtivo ? 'hidden md:flex' : 'flex'}`}>
        {/* Cabeçalho da Inbox */}
        <div className="p-4 bg-white border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <Icons.Chat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base leading-tight">Atendimento</h2>
              <p className="text-xs text-gray-500 font-medium">Conversas com Cadetes</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {totalNaoLidasGeral > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white font-black text-xs animate-pulse">
                {totalNaoLidasGeral} pendentes
              </span>
            )}
            <button
              type="button"
              onClick={handleToggleNotificacoes}
              title={notificacoesAtivas ? 'Notificações ativadas' : 'Ativar notificações'}
              className={`p-2 rounded-lg transition-colors ${notificacoesAtivas ? 'text-amber-500 bg-amber-50' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              <Icons.Bell className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={carregarTodasConversas}
              title="Atualizar lista"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Icons.Refresh className={`w-4 h-4 ${carregandoConversas ? 'animate-spin text-gray-900' : ''}`} />
            </button>
          </div>
        </div>

        {/* Busca e Filtros de Cadetes */}
        <div className="p-3 bg-white border-b border-gray-100 space-y-2">
          <div className="relative">
            <Icons.Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              value={filtroCadete}
              onChange={(e) => setFiltroCadete(e.target.value)}
              placeholder="Buscar por nome, guerra ou número..."
              className="w-full pl-9 pr-8 py-2 bg-gray-100 hover:bg-gray-50 focus:bg-white text-xs rounded-xl border border-transparent focus:border-gray-300 focus:outline-none transition-all placeholder-gray-400"
            />
            {filtroCadete && (
              <button
                type="button"
                onClick={() => setFiltroCadete('')}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <Icons.X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setApenasNaoLidas(false)}
              className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                !apenasNaoLidas ? 'bg-gray-900 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todas ({conversas.length})
            </button>
            <button
              type="button"
              onClick={() => setApenasNaoLidas(true)}
              className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
                apenasNaoLidas ? 'bg-red-600 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Não lidas
              {totalNaoLidasGeral > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  apenasNaoLidas ? 'bg-white text-red-600' : 'bg-red-500 text-white'
                }`}>
                  {totalNaoLidasGeral}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {carregandoConversas && conversas.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs">
              <Icons.Refresh className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-600" />
              Carregando cadetes...
            </div>
          ) : conversasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs">
              Nenhuma conversa encontrada com esse filtro.
            </div>
          ) : (
            conversasFiltradas.map((conv) => {
              const isSelected = cadeteAtivo?.id === conv.cadete.id;
              const esquadrao = getEsquadrao(conv.cadete.numero);
              const dataMsg = conv.ultimaMensagem
                ? new Date(conv.ultimaMensagem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <div
                  key={conv.cadete.id}
                  onClick={() => setCadeteAtivo(conv.cadete)}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-emerald-50/80 border-l-4 border-emerald-600'
                      : 'hover:bg-white bg-transparent border-l-4 border-transparent'
                  }`}
                >
                  {/* Avatar com Iniciais */}
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                      {conv.cadete.nomeDeGuerra.slice(0, 2).toUpperCase()}
                    </div>
                    {conv.naoLidas > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full ring-2 ring-white flex items-center justify-center">
                        {conv.naoLidas}
                      </span>
                    )}
                  </div>

                  {/* Detalhes do Cadete e Última Mensagem */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-0.5">
                      <h4 className="font-bold text-xs sm:text-sm text-gray-900 truncate">
                        {conv.cadete.nomeDeGuerra}
                      </h4>
                      <span className="text-[10px] text-gray-400 shrink-0 font-medium">
                        {dataMsg}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-gray-500 font-medium">
                      <span>Nº {conv.cadete.numero || '---'}</span>
                      <span>•</span>
                      <span className="text-gray-400 truncate">{esquadrao}</span>
                    </div>

                    <p className={`text-xs truncate ${conv.naoLidas > 0 ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                      {conv.ultimaMensagem ? conv.ultimaMensagem.texto : 'Nenhuma mensagem recente'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ================= COLUNA DIREITA: JANELA DE CONVERSA ATIVA ================= */}
      <div className={`flex-1 flex flex-col bg-white ${!cadeteAtivo ? 'hidden md:flex items-center justify-center' : 'flex'}`}>
        {cadeteAtivo ? (
          <>
            {/* Topo da Conversa com Cadete */}
            <div className="p-3.5 sm:p-4 bg-white border-b border-gray-100 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                {/* Botão Voltar no Mobile */}
                <button
                  type="button"
                  onClick={() => setCadeteAtivo(null)}
                  className="p-1.5 -ml-1 text-gray-500 hover:text-gray-900 rounded-lg md:hidden"
                  title="Voltar para lista"
                >
                  <Icons.ArrowDown className="w-5 h-5 rotate-90" />
                </button>

                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                  {cadeteAtivo.nomeDeGuerra.slice(0, 2).toUpperCase()}
                </div>

                <div>
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base leading-tight">
                    {cadeteAtivo.nomeDeGuerra}
                  </h3>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                    <span>Nº {cadeteAtivo.numero}</span>
                    <span>•</span>
                    <span>{getEsquadrao(cadeteAtivo.numero)}</span>
                    <span>•</span>
                    <span className="text-gray-400 truncate max-w-[120px] sm:max-w-none">{cadeteAtivo.nomeCompleto}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setExibirBuscaConversa(!exibirBuscaConversa)}
                  title="Buscar na conversa"
                  className={`p-2 rounded-xl transition-colors ${
                    exibirBuscaConversa ? 'bg-gray-200 text-gray-900' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                >
                  <Icons.Search className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Barra de Pesquisa na Conversa Atual */}
            {exibirBuscaConversa && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2 animate-slide-down">
                <Icons.Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={buscaNaConversa}
                  onChange={(e) => setBuscaNaConversa(e.target.value)}
                  placeholder="Pesquisar nesta conversa..."
                  className="flex-1 text-xs bg-transparent border-none focus:outline-none text-gray-800 placeholder-gray-400"
                  autoFocus
                />
                {buscaNaConversa && (
                  <button
                    type="button"
                    onClick={() => setBuscaNaConversa('')}
                    className="text-xs text-gray-400 hover:text-gray-600 p-1"
                  >
                    <Icons.X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Banner de Segurança E2EE */}
            <div className="bg-emerald-50/60 border-b border-emerald-100/50 px-4 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-emerald-800 font-medium">
              <Icons.Lock className="w-3 h-3 text-emerald-600" />
              <span>Canal Criptografado de Ponta a Ponta (AES-256)</span>
            </div>

            {/* Histórico de Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50/40 to-white">
              {carregandoMensagens ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs py-8">
                  <Icons.Refresh className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
                  Carregando mensagens criptografadas...
                </div>
              ) : mensagensFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-400">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                    <Icons.Chat className="w-6 h-6" />
                  </div>
                  <p className="font-bold text-gray-700 text-sm">Conversa com {cadeteAtivo.nomeDeGuerra}</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm">
                    Nenhuma mensagem registrada ainda. Utilize as respostas rápidas abaixo ou envie uma mensagem personalizada.
                  </p>
                </div>
              ) : (
                mensagensFiltradas.map((msg) => {
                  const souEu = msg.remetentePerfil === 'CANTINA';
                  const horaFormatada = new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${souEu ? 'items-end' : 'items-start'} transition-all`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 shadow-xs text-sm relative ${
                          souEu
                            ? 'bg-gray-900 text-white rounded-br-xs'
                            : 'bg-white text-gray-800 border border-gray-100 rounded-bl-xs'
                        }`}
                      >
                        {/* Card de Pedido Vinculado */}
                        {msg.pedidoVinculado && (
                          <div
                            className={`mb-2 p-2.5 rounded-xl border text-xs ${
                              souEu
                                ? 'bg-gray-800 border-gray-700 text-white'
                                : 'bg-emerald-50 border-emerald-100 text-emerald-950'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold mb-1">
                              <span className="flex items-center gap-1">
                                <Icons.ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
                                Pedido #{msg.pedidoVinculado.id.slice(-5)}
                              </span>
                              <span className="text-emerald-500 font-black">
                                R$ {Number(msg.pedidoVinculado.valorTotal).toFixed(2)}
                              </span>
                            </div>
                            <p className="text-gray-600 line-clamp-2 my-1">
                              {msg.pedidoVinculado.itensResumo}
                            </p>
                            <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500">
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
                            souEu ? 'text-gray-400' : 'text-gray-400'
                          }`}
                        >
                          <span>{horaFormatada}</span>
                          {souEu && (
                            <span>
                              {msg.lida ? (
                                <Icons.CheckCheck className="w-3.5 h-3.5 text-sky-400 inline" />
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

            {/* Barra de Respostas Rápidas (Canned Responses) */}
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 overflow-x-auto flex items-center gap-2 no-scrollbar">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">
                Respostas Rápidas:
              </span>
              {RESPOSTAS_RAPIDAS.map((resposta, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleEnviar(undefined, resposta)}
                  disabled={enviando}
                  className="shrink-0 text-xs bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-gray-700 px-3 py-1.5 rounded-full border border-gray-200 transition-all font-medium active:scale-95 disabled:opacity-50 shadow-2xs"
                >
                  {resposta}
                </button>
              ))}
            </div>

            {/* Campo de Envio de Mensagem */}
            <form onSubmit={handleEnviar} className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={novoTexto}
                onChange={(e) => setNovoTexto(e.target.value)}
                placeholder={`Responder a ${cadeteAtivo.nomeDeGuerra}...`}
                className="flex-1 bg-gray-100 hover:bg-gray-50 focus:bg-white text-gray-900 px-4 py-2.5 text-sm rounded-2xl border border-transparent focus:border-gray-900 focus:outline-none transition-all placeholder-gray-400"
                disabled={enviando}
              />
              <button
                type="submit"
                disabled={!novoTexto.trim() || enviando}
                className="p-2.5 bg-gray-900 hover:bg-black disabled:bg-gray-200 text-white rounded-2xl transition-all shadow-md active:scale-95 disabled:shadow-none flex items-center justify-center shrink-0"
                title="Enviar resposta"
              >
                {enviando ? (
                  <Icons.Refresh className="w-5 h-5 animate-spin" />
                ) : (
                  <Icons.Send className="w-5 h-5" />
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-400">
            <div className="w-16 h-16 rounded-3xl bg-gray-100 text-gray-400 flex items-center justify-center mb-4 text-2xl">
              💬
            </div>
            <h3 className="font-bold text-gray-700 text-base">Selecione uma conversa</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              Escolha um cadete na lista à esquerda para visualizar o histórico de mensagens e responder em tempo real.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
