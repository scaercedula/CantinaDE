import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Usuario, Produto, Pedido, ItemCarrinho, EventoSalgadada, StatusPedido } from '../types';
import { loginAPI } from '../services/loginAPI';
import { StatusBadge, GlassCard } from '../components/GlassUI';
import { getEsquadrao } from '../utils';
import { Icons } from '../components/Icons';

interface CadetePageProps {
  usuario: Usuario;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const CadetePage: React.FC<CadetePageProps> = ({ usuario }) => {
  const [tab, setTab] = useState<'MENU' | 'PEDIDOS' | 'SALGADADA' | 'MINHAS_SALGADADAS' | 'CIDADE'>('MENU');
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtosCidade, setProdutosCidade] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [carrinhoCidade, setCarrinhoCidade] = useState<ItemCarrinho[]>([]);
  const [historico, setHistorico] = useState<Pedido[]>([]);

  // Estados para Salgadada
  const [usuariosDisponiveis, setUsuariosDisponiveis] = useState<Usuario[]>([]);
  const [filtroParticipantes, setFiltroParticipantes] = useState('');
  const [opcoesSalgadada, setOpcoesSalgadada] = useState<Produto[]>([]);
  const [salgadadaNome, setSalgadadaNome] = useState('');
  const [salgadadaParticipantes, setSalgadadaParticipantes] = useState<string[]>([]);
  const [salgadadaItens, setSalgadadaItens] = useState<ItemCarrinho[]>([]);
  const [salgadadaObs, setSalgadadaObs] = useState('');
  const [isSalgadadaSubmitting, setIsSalgadadaSubmitting] = useState(false);
  const [minhasSalgadadas, setMinhasSalgadadas] = useState<EventoSalgadada[]>([]);

  // Filtros de Data (Padrão: Ajustado conforme regra fiscal: dia 20-19)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const hoje = new Date();
    const dia = hoje.getDate();
    const mes = hoje.getMonth();
    // Se dia >= 20, o mês de referência é 2 meses à frente (ex: 20/Fev -> Abril)
    // Se dia < 20, o mês de referência é 1 mês à frente (ex: 10/Mar -> Abril)
    const target = dia >= 20 ? mes + 2 : mes + 1;
    return target % 12;
  });
  const [isMonthSelectorOpen, setIsMonthSelectorOpen] = useState(false);

  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loginAPI.getProdutos('CANTINA').then(setProdutos);
    loginAPI.getProdutos('CIDADE').then(setProdutosCidade);
    loginAPI.getUsuariosParaSalgadada().then(setUsuariosDisponiveis);
    loginAPI.getOpcoesSalgadada().then(setOpcoesSalgadada);
    loadHistory();
    loadMinhasSalgadadas(); // Carrega salgadadas inicialmente também
  }, []);

  // Inicializa participantes com o usuário logado sempre que a aba mudar para SALGADADA
  useEffect(() => {
    if (tab === 'SALGADADA') {
      if (!salgadadaParticipantes.includes(usuario.id)) {
        setSalgadadaParticipantes(prev => [...prev, usuario.id]);
      }
      // loadMinhasSalgadadas(); // Já está no mount inicial, mas pode manter refresh se quiser
      loadMinhasSalgadadas();
    }
  }, [tab, usuario.id]);

  const loadMinhasSalgadadas = () => {
    loginAPI.getMinhasSalgadadas(usuario.id).then(setMinhasSalgadadas);
  };

  const loadHistory = () => {
    loginAPI.getPedidos(usuario.id).then(setHistorico);
  };

  // ... (funções de carrinho existentes: addToCart, removeFromCart, finalizarPedido) ...

  // Funções Salgadada
  const handleCancelarSalgadada = async (eventoId: string) => {
    // Confirmação removida conforme solicitado
    // if (!window.confirm("Tem certeza que deseja cancelar este evento?")) return;

    try {
      await loginAPI.atualizarStatusEventoSalgadada(eventoId, StatusPedido.CANCELADO);
      alert("Evento cancelado com sucesso!");
      loadMinhasSalgadadas();
    } catch (error) {
      console.error(error);
      alert("Erro ao cancelar o evento.");
    }
  };

  const toggleParticipante = (id: string) => {
    // Impede remover o próprio usuário
    if (id === usuario.id) return;

    setSalgadadaParticipantes(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const addSalgadadaItem = (p: Produto) => {
    setSalgadadaItens(prev => {
      const existing = prev.find(i => i.id === p.id);
      if (existing) {
        // Se for CENTO, adiciona +100. Se for UNIDADE, +1.
        const incremento = p.unidade === 'CENTO' ? 100 : 1;
        return prev.map(i => i.id === p.id ? { ...i, quantidade: i.quantidade + incremento } : i);
      }
      // Inicializa com 100 se for CENTO, 1 se for UNIDADE
      const qtdInicial = p.unidade === 'CENTO' ? 100 : 1;
      return [...prev, { ...p, quantidade: qtdInicial }];
    });
  };

  const removeSalgadadaItem = (id: string) => {
    setSalgadadaItens(prev => prev.filter(i => i.id !== id));
  };

  const updateSalgadadaItemQtd = (id: string, novaQtd: number) => {
    setSalgadadaItens(prev => prev.map(i => {
      if (i.id === id) {
        return novaQtd >= 0 ? { ...i, quantidade: novaQtd } : i;
      }
      return i;
    }));
  };

  const calcularPrecoItemSalgadada = (item: ItemCarrinho) => {
    if (item.unidade === 'CENTO') {
      return (item.quantidade / 100) * item.preco;
    }
    return item.quantidade * item.preco;
  };

  const criarSalgadada = async () => {
    if (!salgadadaNome || salgadadaParticipantes.length === 0 || salgadadaItens.length === 0) {
      alert("Preencha o nome do evento, selecione participantes e adicione itens.");
      return;
    }

    setIsSalgadadaSubmitting(true);
    const total = salgadadaItens.reduce((acc, i) => acc + calcularPrecoItemSalgadada(i), 0);

    try {
      await loginAPI.criarEventoSalgadada({
        nome: salgadadaNome,
        responsavelId: usuario.id,
        responsavelNome: usuario.nomeDeGuerra,
        participantesIds: salgadadaParticipantes,
        itens: salgadadaItens,
        valorTotal: total,
        observacoes: salgadadaObs
      });

      alert("Salgadada criada com sucesso!");
      setSalgadadaNome('');
      setSalgadadaParticipantes([usuario.id]); // Mantém o usuário logado
      setSalgadadaItens([]);
      setSalgadadaObs('');
      setTab('PEDIDOS');
      loadHistory();
    } catch (e) {
      alert("Erro ao criar salgadada.");
    } finally {
      setIsSalgadadaSubmitting(false);
    }
  };

  const valorTotalSalgadada = salgadadaItens.reduce((acc, i) => acc + calcularPrecoItemSalgadada(i), 0);
  const valorPorPessoa = salgadadaParticipantes.length > 0 ? valorTotalSalgadada / salgadadaParticipantes.length : 0;

  const addToCart = (p: Produto, origem: 'CANTINA' | 'CIDADE' = 'CANTINA') => {
    const setTargetCarrinho = origem === 'CANTINA' ? setCarrinho : setCarrinhoCidade;

    setTargetCarrinho(prev => {
      const existing = prev.find(i => i.id === p.id);
      if (existing) {
        return prev.map(i => i.id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i);
      }
      return [...prev, { ...p, quantidade: 1 }];
    });
  };

  const removeFromCart = (id: string, origem: 'CANTINA' | 'CIDADE' = 'CANTINA') => {
    const setTargetCarrinho = origem === 'CANTINA' ? setCarrinho : setCarrinhoCidade;

    setTargetCarrinho(prev => {
      const existing = prev.find(i => i.id === id);
      if (existing && existing.quantidade > 1) {
        return prev.map(i => i.id === id ? { ...i, quantidade: i.quantidade - 1 } : i);
      }
      return prev.filter(i => i.id !== id);
    });

    // Fecha carrinho se vazio (apenas para o carrinho atual)
    // if (carrinho.length <= 1) setIsCartExpanded(false); // Lógica simplificada
  };

  const finalizarPedido = async (origem: 'CANTINA' | 'CIDADE' = 'CANTINA') => {
    const targetCarrinho = origem === 'CANTINA' ? carrinho : carrinhoCidade;
    const setTargetCarrinho = origem === 'CANTINA' ? setCarrinho : setCarrinhoCidade;

    if (targetCarrinho.length === 0 || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const total = targetCarrinho.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);

      // Tenta capturar IP (silenciosamente)
      let userIp = '';
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        userIp = data.ip;
      } catch (e) {
        console.warn('Não foi possível capturar IP');
      }

      await loginAPI.criarPedido(usuario, targetCarrinho, total, {
        ip: userIp,
        userAgent: navigator.userAgent,
        origem: origem
      });

      setTargetCarrinho([]);
      setIsCartExpanded(false);
      setTab('PEDIDOS');
      loadHistory();
      alert(`Pedido na ${origem === 'CANTINA' ? 'Cantina' : 'Loja da Cidade'} realizado com sucesso!`);
    } catch (error) {
      console.error("Erro ao finalizar pedido:", error);
      alert("Erro ao finalizar pedido.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cálculo do Período Fiscal
  // Regra: Mês de Referência X = 20 do Mês (X-2) até 19 do Mês (X-1)
  const fiscalPeriod = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startMonth = selectedMonth - 2;
    const endMonth = selectedMonth - 1;

    // Javascript Date lida automaticamente com meses negativos ajustando o ano (ex: 2025, -1 vira Dez 2024)
    const startDate = new Date(currentYear, startMonth, 20, 0, 0, 0);
    const endDate = new Date(currentYear, endMonth, 19, 23, 59, 59);

    return { startDate, endDate };
  }, [selectedMonth]);

  const gastosNoPeriodo = useMemo(() => {
    const totalPedidos = historico
      .filter(p => {
        const d = new Date(p.data);
        return d >= fiscalPeriod.startDate && d <= fiscalPeriod.endDate && p.status !== 'CANCELADO';
      })
      .reduce((acc, curr) => acc + curr.valorTotal, 0);

    const totalSalgadadas = minhasSalgadadas
      .filter(e => {
        const d = new Date(e.data);
        return d >= fiscalPeriod.startDate && d <= fiscalPeriod.endDate && e.status === StatusPedido.CONCLUIDO;
      })
      .reduce((acc, curr) => {
        const numParticipantes = curr.participantesIds.length || 1;
        return acc + (curr.valorTotal / numParticipantes);
      }, 0);

    return totalPedidos + totalSalgadadas;
  }, [historico, minhasSalgadadas, fiscalPeriod]);

  const valorCarrinho = carrinho.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);
  const qtdItensCarrinho = carrinho.reduce((acc, i) => acc + i.quantidade, 0);

  const valorCarrinhoCidade = carrinhoCidade.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);
  const qtdItensCarrinhoCidade = carrinhoCidade.reduce((acc, i) => acc + i.quantidade, 0);

  const renderFloatingCart = () => {
    if (carrinho.length === 0) return null;

    return createPortal(
      <>
        {isCartExpanded && (
          <div
            className="fixed inset-0 bg-gray-900/30 z-[9998] backdrop-blur-sm transition-all animate-fade-in"
            onClick={() => setIsCartExpanded(false)}
          />
        )}

        <div className={`fixed bottom-6 right-6 z-[9999] flex flex-col items-end transition-all duration-300 ${isCartExpanded ? 'w-[calc(100%-3rem)] max-w-sm' : 'w-auto'}`}>

          {/* Lista Expandida - Glass Effect Claro */}
          {isCartExpanded && (
            <div className="w-full bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden mb-4 animate-slide-up origin-bottom-right">
              <div className="p-5 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-500"></span>
                  Seu Pedido
                </h3>
                <button onClick={() => setIsCartExpanded(false)} className="bg-white/50 rounded-full p-2 text-gray-400 hover:text-gray-600 shadow-sm transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="max-h-[50vh] overflow-y-auto p-2 space-y-1 scrollbar-thin">
                {carrinho.map(item => (
                  <div key={item.id} className="flex justify-between items-center p-3 hover:bg-black/5 rounded-xl transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="bg-brand-100 text-brand-700 min-w-[32px] h-8 flex items-center justify-center rounded-lg text-sm font-bold">
                        {item.quantidade}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-gray-900 font-bold text-sm truncate leading-tight">{item.nome}</span>
                        <span className="text-xs text-gray-400 font-medium">Unit: R$ {item.preco.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-2">
                      <span className="font-bold text-gray-900 text-base">R$ {(item.preco * item.quantidade).toFixed(2)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                        className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-gray-50/80 border-t border-gray-100">
                <div className="flex justify-between items-end mb-4 px-1">
                  <span className="text-gray-500 font-bold uppercase text-xs tracking-wider mb-1">Total a Pagar</span>
                  <span className="text-3xl font-extrabold text-gray-900 leading-none">R$ {valorCarrinho.toFixed(2)}</span>
                </div>
                <button
                  onClick={() => finalizarPedido('CANTINA')}
                  disabled={isSubmitting}
                  className={`w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-lg shadow-xl shadow-gray-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Processando...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirmar Pedido</span>
                      <span className="group-hover:translate-x-1 transition-transform">
                        <Icons.Cart />
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Botão Flutuante (FAB) - Dark Glass Style */}
          <button
            onClick={() => setIsCartExpanded(!isCartExpanded)}
            className={`flex items-center gap-5 bg-gray-800/90 backdrop-blur-md text-white shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-all duration-300 border border-white/10 hover:bg-gray-800 ${isCartExpanded ? 'rounded-3xl px-6 py-4 scale-95 opacity-50' : 'rounded-full px-7 py-4 hover:scale-105 active:scale-95'}`}
          >
            <div className="relative">
              <Icons.Cart />
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-0.5 rounded-full flex items-center justify-center border-2 border-gray-800 shadow-sm">
                {qtdItensCarrinho}
              </span>
            </div>

            {!isCartExpanded && (
              <div className="flex flex-col items-start leading-none">
                <span className="text-[9px] uppercase font-bold text-gray-400 tracking-widest mb-1">Total</span>
                <span className="font-black text-lg tracking-tight">R$ {valorCarrinho.toFixed(2)}</span>
              </div>
            )}

            {!isCartExpanded && (
              <div className="text-gray-500 pl-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
              </div>
            )}
          </button>
        </div>
      </>,
      document.body
    );
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      {/* Header Simplificado */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col items-center text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-400 to-blue-500"></div>

        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Gastos em {MESES[selectedMonth]}</span>
        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-4xl font-black text-gray-900 tracking-tight">R$ {gastosNoPeriodo.toFixed(2)}</span>
        </div>
        <p className="text-gray-400 text-xs">
          Período: {fiscalPeriod.startDate.toLocaleDateString()} a {fiscalPeriod.endDate.toLocaleDateString()}
        </p>


        {/* Seletor de Mês Minimalista */}
        <div className="relative">
          <button
            onClick={() => setIsMonthSelectorOpen(!isMonthSelectorOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-full text-xs font-bold text-gray-600 transition-colors"
          >
            <Icons.History className="w-3 h-3" />
            <span>Alterar Mês</span>
          </button>
          {isMonthSelectorOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsMonthSelectorOpen(false)}></div>
              <div className="relative top-full mt-2 w-64 bg-white border border-gray-200 rounded-2xl shadow-xl z-20 p-2 grid grid-cols-3 gap-1 animate-fade-in">
                {MESES.map((mes, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setSelectedMonth(idx); setIsMonthSelectorOpen(false); }}
                    className={`px-2 py-2 rounded-lg text-[10px] font-bold transition-all ${selectedMonth === idx
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-500 hover:bg-gray-50'
                      }`}
                  >
                    {mes.substring(0, 3)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation Tabs - Simplificado (Murphy's Law: Obvious & Simple) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button
          onClick={() => setTab('MENU')}
          className={`p-4 rounded-2xl flex flex-col items-center gap-2 transition-all ${tab === 'MENU' ? 'bg-brand-600 text-white shadow-lg shadow-brand-200' : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100'}`}
        >
          <Icons.ShoppingBag className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Cantina da D.E</span>
        </button>

        <button
          onClick={() => setTab('CIDADE')}
          className={`p-4 rounded-2xl flex flex-col items-center gap-2 transition-all ${tab === 'CIDADE' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100'}`}
        >
          <Icons.ShoppingBag className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Loja da Cidade</span>
        </button>

        <button
          onClick={() => setTab('PEDIDOS')}
          className={`p-4 rounded-2xl flex flex-col items-center gap-2 transition-all ${tab === 'PEDIDOS' ? 'bg-gray-800 text-white shadow-lg' : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100'}`}
        >
          <Icons.History className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Histórico</span>
        </button>

        <button
          onClick={() => setTab('MINHAS_SALGADADAS')}
          className={`p-4 rounded-2xl flex flex-col items-center gap-2 transition-all ${tab === 'MINHAS_SALGADADAS' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100'}`}
        >
          <Icons.Users className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Salgadadas</span>
        </button>

        <button
          onClick={() => setTab('SALGADADA')}
          className={`p-4 rounded-2xl flex flex-col items-center gap-2 transition-all ${tab === 'SALGADADA' ? 'bg-green-600 text-white shadow-lg shadow-green-200' : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100'}`}
        >
          <Icons.Plus className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Fazer pedido de salgadada</span>
        </button>
      </div>

      {tab === 'CIDADE' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-24">
          <div className="col-span-full mb-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-full text-blue-600">
              <Icons.ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-blue-900">Loja da Cidade</h3>
              <p className="text-xs text-blue-600">Faça pedidos na loja da cidade e pague na cédula</p>
            </div>
          </div>

          {produtosCidade.map(produto => (
            <GlassCard key={produto.id} className="flex flex-col justify-between !p-0 overflow-hidden group hover:shadow-xl transition-all duration-300 border-0 bg-white shadow-sm ring-1 ring-blue-50">
              <div className="relative h-auto bg-blue-50/30 overflow-hidden">
                <div className="absolute top-2 right-2 bg-white/90 backdrop-blur text-blue-900 text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm">
                  {produto.categoria}
                </div>
              </div>

              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-gray-800 text-sm leading-tight mb-1 line-clamp-2 min-h-[2.5em]">{produto.nome}</h3>
                <p className="text-[10px] text-gray-500 line-clamp-2 mb-3 flex-1">{produto.descricao}</p>

                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                  <span className="text-lg font-black text-blue-600">R$ {produto.preco.toFixed(2)}</span>
                  <button
                    onClick={() => addToCart(produto, 'CIDADE')}
                    className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm hover:shadow-blue-500/30 active:scale-90"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>
            </GlassCard>
          ))}

          {/* Floating Cart para Cidade */}
          {carrinhoCidade.length > 0 && createPortal(
            <>
              <div
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${isCartExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsCartExpanded(false)}
              />

              <div className={`fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4 transition-all duration-500 ${isCartExpanded ? 'translate-y-0' : 'translate-y-0'}`}>

                {isCartExpanded && (
                  <div className="bg-white/90 backdrop-blur-xl border border-white/40 p-6 rounded-[2rem] shadow-2xl w-80 mb-2 animate-slide-up origin-bottom-right">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-extrabold text-xl text-blue-900 flex items-center gap-2">
                        <span className="bg-blue-100 p-1.5 rounded-lg text-blue-600"><Icons.ShoppingBag className="w-5 h-5" /></span>
                        Carrinho (Cidade)
                      </h3>
                      <button onClick={() => setIsCartExpanded(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>

                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                      {carrinhoCidade.map(item => (
                        <div key={item.id} className="flex justify-between items-center group">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-800 text-sm">{item.nome}</span>
                            <span className="text-[10px] text-gray-400 font-mono">R$ {item.preco.toFixed(2)} x {item.quantidade}</span>
                          </div>
                          <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-1 border border-gray-100">
                            <button
                              onClick={() => removeFromCart(item.id, 'CIDADE')}
                              className="w-6 h-6 flex items-center justify-center bg-white text-red-500 rounded-lg shadow-sm hover:bg-red-50 transition-colors font-bold"
                            >-</button>
                            <span className="text-xs font-bold w-4 text-center">{item.quantidade}</span>
                            <button
                              onClick={() => addToCart(item, 'CIDADE')}
                              className="w-6 h-6 flex items-center justify-center bg-white text-blue-600 rounded-lg shadow-sm hover:bg-blue-50 transition-colors font-bold"
                            >+</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <div className="flex justify-between items-end mb-4">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Estimado</span>
                        <span className="text-3xl font-black text-blue-600 tracking-tighter">R$ {valorCarrinhoCidade.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={() => finalizarPedido('CIDADE')}
                        disabled={isSubmitting}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processando...</>
                        ) : (
                          <>Confirmar Pedido <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setIsCartExpanded(!isCartExpanded)}
                  className={`flex items-center gap-5 bg-blue-600/90 backdrop-blur-md text-white shadow-[0_8px_30px_rgba(37,99,235,0.4)] transition-all duration-300 border border-white/10 hover:bg-blue-700 ${isCartExpanded ? 'rounded-3xl px-6 py-4 scale-95 opacity-50' : 'rounded-full px-7 py-4 hover:scale-105 active:scale-95'}`}
                >
                  <div className="relative">
                    <Icons.Cart />
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-0.5 rounded-full flex items-center justify-center border-2 border-blue-600 shadow-sm">
                      {qtdItensCarrinhoCidade}
                    </span>
                  </div>

                  {!isCartExpanded && (
                    <div className="flex flex-col items-start leading-none">
                      <span className="text-[9px] uppercase font-bold text-blue-200 tracking-widest mb-1">Total (Cidade)</span>
                      <span className="font-black text-lg tracking-tight">R$ {valorCarrinhoCidade.toFixed(2)}</span>
                    </div>
                  )}

                  {!isCartExpanded && (
                    <div className="text-blue-200 pl-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                    </div>
                  )}
                </button>
              </div>
            </>,
            document.body
          )}
        </div>
      )}

      {tab === 'SALGADADA' && (
        <div className="space-y-6 pb-20 animate-fade-in">
          <GlassCard className="!p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Nova Salgadada</h2>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-sm text-blue-800">
              <strong>Orientações:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Preencha o nome do evento (ex: Salgadada da equipe de TFPM).</li>
                <li>Selecione todos os cadetes que participarão da salgadada.</li>
                <li>Adicione os itens (salgados, bebidas).</li>
                <li>O valor total será dividido igualmente entre os participantes selecionados na cédula.</li>
                <li>Em caso de mudanças nas pessoas que participaram por ter entrado ou saído gente depois do pedido, entre em contato com algum assessor de cédula.</li>
              </ul>
            </div>

            <div className="space-y-6">
              {/* Nome do Evento */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Nome do Evento</label>
                <input
                  type="text"
                  value={salgadadaNome}
                  onChange={(e) => setSalgadadaNome(e.target.value)}
                  placeholder="Ex: Salgadada da equipe de TFM"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition-all"
                />
              </div>

              {/* Participantes */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-bold text-gray-700">Participantes ({salgadadaParticipantes.length})</label>
                  <input
                    type="text"
                    placeholder="Buscar participante..."
                    value={filtroParticipantes}
                    onChange={(e) => setFiltroParticipantes(e.target.value)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none w-48"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl p-2 grid grid-cols-2 md:grid-cols-3 gap-2 bg-white/50">
                  {/* Card do Usuário Logado (Fixo) */}
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-brand-50 border border-brand-200 opacity-80 cursor-not-allowed">
                    <div className="w-4 h-4 rounded border border-brand-500 bg-brand-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-xs font-bold text-brand-900 truncate">{usuario.nomeDeGuerra} (Você)</span>
                  </div>

                  {/* Outros Usuários */}
                  {(() => {
                    const listaFiltrada = usuariosDisponiveis
                      .filter(u => u.id !== usuario.id)
                      .filter(u =>
                        u.nomeDeGuerra.toLowerCase().includes(filtroParticipantes.toLowerCase()) ||
                        u.nomeCompleto.toLowerCase().includes(filtroParticipantes.toLowerCase())
                      );

                    if (listaFiltrada.length === 0) {
                      return (
                        <div className="col-span-full text-center py-4 text-gray-400 text-xs">
                          {usuariosDisponiveis.length <= 1
                            ? "Nenhum outro cadete encontrado. Verifique se a regra de List/Search na coleção 'users' permite listar outros usuários."
                            : "Nenhum participante encontrado com esse nome."}
                        </div>
                      );
                    }

                    return listaFiltrada.map(u => (
                      <button
                        key={u.id}
                        onClick={() => toggleParticipante(u.id)}
                        className={`flex items-center gap-2 p-2 rounded-lg text-left transition-all ${salgadadaParticipantes.includes(u.id)
                          ? 'bg-brand-100 border-brand-300 text-brand-900 ring-1 ring-brand-300'
                          : 'hover:bg-gray-100 text-gray-600 border border-transparent'
                          }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${salgadadaParticipantes.includes(u.id) ? 'bg-brand-500 border-brand-500' : 'border-gray-300 bg-white'}`}>
                          {salgadadaParticipantes.includes(u.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-xs font-bold truncate">{u.nomeDeGuerra}</span>
                          <span className="text-[9px] text-gray-400 truncate">
                            {(() => {
                              const esquadrao = getEsquadrao(u.numero, u.esquadrao);
                              return esquadrao ? <span className="font-semibold text-gray-500 mr-1">{esquadrao} •</span> : '';
                            })()}
                            {u.perfil}
                          </span>
                        </div>
                      </button>
                    ));
                  })()}
                </div>
              </div>

              {/* Seleção de Itens */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Itens do Pedido</label>

                {/* Lista de Produtos Disponíveis (Salgadada) */}
                <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-thin">
                  {opcoesSalgadada.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addSalgadadaItem(p)}
                      className="flex-shrink-0 w-40 bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-all text-left group flex flex-col justify-between h-32"
                    >
                      <div>
                        <div className="font-bold text-gray-800 text-sm truncate group-hover:text-brand-600" title={p.nome}>{p.nome}</div>
                        <div className="text-[10px] text-gray-400 uppercase font-bold mt-1">{p.unidade === 'CENTO' ? 'Preço do Cento' : 'Preço Unitário'}</div>
                        <div className="text-sm font-bold text-gray-900">R$ {p.preco.toFixed(2)}</div>
                      </div>
                      <div className="mt-2 text-center bg-gray-50 rounded-lg py-1.5 text-xs font-bold text-gray-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                        + Adicionar
                      </div>
                    </button>
                  ))}
                </div>

                {/* Itens Selecionados */}
                {salgadadaItens.length > 0 ? (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    {salgadadaItens.map(item => (
                      <div key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-3 rounded-lg shadow-sm border border-gray-100 gap-3">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-800">{item.nome}</span>
                            <span className="text-[10px] text-gray-400 uppercase font-bold">
                              {item.unidade === 'CENTO' ? 'Qtd (Unidades)' : 'Quantidade'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateSalgadadaItemQtd(item.id, item.quantidade - (item.unidade === 'CENTO' ? 10 : 1))}
                              className="w-8 h-8 bg-gray-100 rounded-lg text-gray-600 font-bold hover:bg-gray-200 flex items-center justify-center"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={item.quantidade}
                              onChange={(e) => updateSalgadadaItemQtd(item.id, parseInt(e.target.value) || 0)}
                              className="w-16 text-center font-bold border border-gray-200 rounded-lg py-1 focus:ring-2 focus:ring-brand-200 outline-none"
                            />
                            <button
                              onClick={() => updateSalgadadaItemQtd(item.id, item.quantidade + (item.unidade === 'CENTO' ? 10 : 1))}
                              className="w-8 h-8 bg-gray-100 rounded-lg text-gray-600 font-bold hover:bg-gray-200 flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>

                          <div className="flex items-center gap-3 min-w-[100px] justify-end">
                            <span className="text-sm font-bold text-gray-900">R$ {calcularPrecoItemSalgadada(item).toFixed(2)}</span>
                            <button onClick={() => removeSalgadadaItem(item.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                              <Icons.Trash />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400 text-sm">
                    Nenhum item adicionado. Selecione acima.
                  </div>
                )}
              </div>

              {/* Observações */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Observações</label>
                <textarea
                  value={salgadadaObs}
                  onChange={(e) => setSalgadadaObs(e.target.value)}
                  placeholder="Ex: Fulano irá buscar os salgados às 15:30h após o deslocamento dos cadetes"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition-all h-24 resize-none"
                />
              </div>

              {/* Resumo e Ação */}
              <div className="bg-gray-900 text-white rounded-2xl p-6 shadow-xl">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-1">Total do Evento</p>
                    <p className="text-3xl font-extrabold">R$ {valorTotalSalgadada.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-1">Por Pessoa ({salgadadaParticipantes.length})</p>
                    <p className="text-xl font-bold text-brand-400">R$ {valorPorPessoa.toFixed(2)}</p>
                  </div>
                </div>

                <button
                  onClick={criarSalgadada}
                  disabled={isSalgadadaSubmitting}
                  className={`w-full py-4 bg-brand-500 hover:bg-brand-400 text-white rounded-xl font-bold text-lg shadow-lg shadow-brand-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${isSalgadadaSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isSalgadadaSubmitting ? 'Criando Evento...' : 'Confirmar Salgadada'}
                </button>
              </div>

            </div>
          </GlassCard>
        </div>
      )}

      {tab === 'MINHAS_SALGADADAS' && (
        <div className="space-y-6 pb-20 animate-fade-in">

          {/* Seção de Salgadadas Ativas (Em Andamento) */}
          {minhasSalgadadas.filter(s => s.status === StatusPedido.PENDENTE).length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-4 px-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></span>
                Salgadadas em andamento
              </h2>
              <div className="space-y-4">
                {minhasSalgadadas.filter(s => s.status === StatusPedido.PENDENTE).map(evento => (
                  <GlassCard key={evento.id} className="!p-5 border-l-4 border-l-brand-500 bg-brand-50/30">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-gray-900 text-lg">{evento.nome}</h3>
                          <StatusBadge status={evento.status} />
                        </div>
                        <p className="text-xs text-gray-500 mb-2 font-medium">
                          {new Date(evento.data).toLocaleDateString()} • {evento.participantesIds.length} Participantes
                        </p>
                        <p className="text-sm font-bold text-brand-600">Total: R$ {evento.valorTotal.toFixed(2)}</p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelarSalgadada(evento.id);
                        }}
                        className="bg-white hover:bg-red-50 text-red-500 hover:text-red-700 border border-gray-200 hover:border-red-200 px-3 py-2 rounded-xl transition-all text-xs font-bold flex items-center gap-2 shadow-sm active:scale-95"
                      >
                        <Icons.XCircle className="w-4 h-4" />
                        Cancelar Evento
                      </button>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-200/50">
                      <p className="text-xs text-gray-600 font-medium">
                        <span className="uppercase text-[10px] text-gray-400 font-bold tracking-wider mr-1">Itens:</span>
                        {evento.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ')}
                      </p>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-xl font-bold text-gray-800 mb-4">Histórico de Salgadadas</h2>
          {minhasSalgadadas.filter(s => s.status !== StatusPedido.PENDENTE).length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400 text-sm">
              Nenhuma salgadada concluída ou cancelada.
            </div>
          ) : (
            <div className="space-y-4">
              {minhasSalgadadas.filter(s => s.status !== StatusPedido.PENDENTE).map(evento => (
                <GlassCard key={evento.id} className="!p-4 border-l-4 border-l-gray-300/50 opacity-90">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900">{evento.nome}</h3>
                        <StatusBadge status={evento.status} />
                      </div>
                      <p className="text-xs text-gray-500 mb-2">
                        {new Date(evento.data).toLocaleDateString()} • {evento.participantesIds.length} Participantes
                      </p>
                      <p className="text-sm font-bold text-brand-600">Total: R$ {evento.valorTotal.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Detalhes dos Itens (Expansível ou fixo) */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      {evento.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ')}
                    </p>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'PEDIDOS' && (
        <div className="space-y-4 pb-20 animate-fade-in">
          <h2 className="text-xl font-bold text-gray-800 mb-4 px-2">Histórico de Pedidos</h2>

          {historico.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
                <Icons.History className="w-8 h-8" />
              </div>
              <p className="text-gray-500 font-medium">Nenhum pedido realizado ainda.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {historico.map(pedido => (
                <div key={pedido.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
                  <div className="flex justify-between items-start border-b border-gray-50 pb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-2 py-1 rounded-md ${pedido.origem === 'CIDADE' ? 'bg-blue-100 text-blue-700' : 'bg-brand-100 text-brand-700'}`}>
                          {pedido.origem === 'CIDADE' ? 'LOJA DA CIDADE' : 'CANTINA'}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">
                          {new Date(pedido.data).toLocaleString()}
                        </span>
                      </div>
                      <StatusBadge status={pedido.status} />
                    </div>
                    <span className="text-lg font-black text-gray-900">R$ {pedido.valorTotal.toFixed(2)}</span>
                  </div>

                  <div className="space-y-2">
                    {pedido.itens.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm text-gray-600">
                        <span>{item.quantidade}x {item.nome}</span>
                        <span className="font-medium text-gray-900">R$ {(item.preco * item.quantidade).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'MENU' ? (
        <div className="space-y-6 pb-48">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {produtos.map(p => (
              <GlassCard key={p.id} className="!p-6 flex justify-between items-center group hover:border-brand-500/30 transition-all hover:shadow-lg cursor-default">
                <div className="flex-1 pr-4">
                  <h3 className="font-bold text-gray-900 text-lg mb-1">{p.nome}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed mb-3 font-medium">{p.descricao}</p>
                  <span className="text-lg font-black text-brand-600 bg-brand-50/50 px-3 py-1 rounded-lg inline-block border border-brand-100">R$ {p.preco.toFixed(2)}</span>
                </div>
                <div>
                  <button
                    onClick={() => addToCart(p)}
                    className="w-14 h-14 bg-gray-50 hover:bg-brand-600 text-gray-900 hover:text-white rounded-2xl flex items-center justify-center font-bold text-3xl transition-all active:scale-90 border border-gray-200 hover:border-brand-600 shadow-sm"
                  >
                    +
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>
          {renderFloatingCart()}
        </div>
      ) : (
        <div className="space-y-4 pb-20 animate-fade-in">

          {/* Seção de Salgadadas Ativas */}
          {minhasSalgadadas.filter(s => s.status === StatusPedido.PENDENTE).length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-4 px-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></span>
                Salgadadas em andamento
              </h2>
              <div className="space-y-4">
                {minhasSalgadadas.filter(s => s.status === StatusPedido.PENDENTE).map(evento => (
                  <GlassCard key={evento.id} className="!p-5 border-l-4 border-l-brand-500 bg-brand-50/30">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-gray-900 text-lg">{evento.nome}</h3>
                          <StatusBadge status={evento.status} />
                        </div>
                        <p className="text-xs text-gray-500 mb-2 font-medium">
                          {new Date(evento.data).toLocaleDateString()} • {evento.participantesIds.length} Participantes
                        </p>
                        <p className="text-sm font-bold text-brand-600">Total: R$ {evento.valorTotal.toFixed(2)}</p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelarSalgadada(evento.id);
                        }}
                        className="bg-white hover:bg-red-50 text-red-500 hover:text-red-700 border border-gray-200 hover:border-red-200 px-3 py-2 rounded-xl transition-all text-xs font-bold flex items-center gap-2 shadow-sm active:scale-95"
                      >
                        <Icons.XCircle className="w-4 h-4" />
                        Cancelar Evento
                      </button>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-200/50">
                      <p className="text-xs text-gray-600 font-medium">
                        <span className="uppercase text-[10px] text-gray-400 font-bold tracking-wider mr-1">Itens:</span>
                        {evento.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ')}
                      </p>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {/* Histórico de Pedidos removido conforme solicitação */}
          {/* <h2 className="text-xl font-bold text-gray-800 mb-4 px-2">Histórico de Pedidos</h2>
          {historico.map(p => ( ... ))} */}
        </div>
      )}
    </div>
  );
};
