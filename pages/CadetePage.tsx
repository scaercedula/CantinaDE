import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Usuario, Produto, Pedido, ItemCarrinho } from '../types';
import { loginAPI } from '../services/loginAPI';
import { StatusBadge, GlassCard } from '../components/GlassUI';
import { Icons } from '../components/Icons';

interface CadetePageProps {
  usuario: Usuario;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const CadetePage: React.FC<CadetePageProps> = ({ usuario }) => {
  const [tab, setTab] = useState<'MENU' | 'PEDIDOS'>('MENU');
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [historico, setHistorico] = useState<Pedido[]>([]);
  
  // Filtros de Data (Padrão: Mês atual)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [isMonthSelectorOpen, setIsMonthSelectorOpen] = useState(false);
  
  const [isCartExpanded, setIsCartExpanded] = useState(false);

  useEffect(() => {
    loginAPI.getProdutos().then(setProdutos);
    loadHistory();
  }, []);

  const loadHistory = () => {
    loginAPI.getPedidos(usuario.id).then(setHistorico);
  };

  const addToCart = (p: Produto) => {
    setCarrinho(prev => {
      const existing = prev.find(i => i.id === p.id);
      if (existing) {
        return prev.map(i => i.id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i);
      }
      return [...prev, { ...p, quantidade: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCarrinho(prev => prev.filter(i => i.id !== id));
    if (carrinho.length <= 1) setIsCartExpanded(false);
  };

  const finalizarPedido = async () => {
    if (carrinho.length === 0) return;
    const total = carrinho.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);
    await loginAPI.criarPedido(usuario, carrinho, total);
    setCarrinho([]);
    setIsCartExpanded(false);
    setTab('PEDIDOS');
    loadHistory();
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
    return historico
      .filter(p => {
        const d = new Date(p.data);
        return d >= fiscalPeriod.startDate && d <= fiscalPeriod.endDate && p.status !== 'CANCELADO';
      })
      .reduce((acc, curr) => acc + curr.valorTotal, 0);
  }, [historico, fiscalPeriod]);

  const valorCarrinho = carrinho.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);
  const qtdItensCarrinho = carrinho.reduce((acc, i) => acc + i.quantidade, 0);

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
                  onClick={finalizarPedido}
                  className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-lg shadow-xl shadow-gray-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                >
                  <span>Confirmar Pedido</span>
                  <span className="group-hover:translate-x-1 transition-transform">
                     <Icons.Cart />
                  </span>
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
    <div className="space-y-8">
      {/* Header Info Cards com Filtro */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard className="flex flex-col justify-between !p-5 relative overflow-visible z-10">
          <div className="absolute top-0 right-0 p-2 opacity-50">
             <Icons.Money />
          </div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mt-1.5">Gastos no Mês</span>
            
            {/* Seletor de Mês Customizado (Dropdown) */}
            <div className="relative">
              <button 
                onClick={() => setIsMonthSelectorOpen(!isMonthSelectorOpen)}
                className="flex items-center gap-2 px-3 mx-8 py-1.5 bg-brand-50/80 hover:bg-brand-100 border border-brand-200/50 rounded-xl text-[10px] font-bold text-brand-800 shadow-sm transition-all"
              >
                <span className="uppercase tracking-wider">{MESES[selectedMonth]}</span>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-3 w-3 transition-transform duration-200 ${isMonthSelectorOpen ? 'rotate-180' : ''}`} 
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isMonthSelectorOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsMonthSelectorOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white/95 backdrop-blur-2xl border border-white/50 rounded-2xl shadow-xl z-20 p-3 grid grid-cols-3 gap-2 animate-slide-up origin-top-right">
                    {MESES.map((mes, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setSelectedMonth(idx); setIsMonthSelectorOpen(false); }}
                        className={`px-2 py-2 rounded-lg text-xs font-bold transition-all ${
                          selectedMonth === idx 
                            ? 'bg-brand-600 text-white shadow-brand-500/30 shadow-md' 
                            : 'text-gray-600 hover:bg-gray-100 hover:text-brand-600'
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
          
          <span className="text-3xl font-extrabold text-gray-900 mt-2">R$ {gastosNoPeriodo.toFixed(2)}</span>
          <span className="text-[9px] text-gray-400 font-medium mt-1">
            De {fiscalPeriod.startDate.toLocaleDateString().slice(0,5)} até {fiscalPeriod.endDate.toLocaleDateString().slice(0,5)}
          </span>
        </GlassCard>

        <GlassCard className="flex flex-col justify-between !p-5 z-0">
          <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-2">Situação</span>
          <span className="text-lg font-bold text-brand-600 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-brand-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]"></span>
            Regular
          </span>
        </GlassCard>
      </div>

      {/* Tabs */}
      <div className="flex p-1.5 bg-gray-200/50 backdrop-blur-sm rounded-2xl border border-white/40">
        <button 
          onClick={() => setTab('MENU')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all shadow-sm ${tab === 'MENU' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 shadow-none hover:bg-white/30'}`}
        >
          FAZER PEDIDO
        </button>
        <button 
          onClick={() => setTab('PEDIDOS')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all shadow-sm ${tab === 'PEDIDOS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 shadow-none hover:bg-white/30'}`}
        >
          MEUS PEDIDOS
        </button>
      </div>

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
        <div className="space-y-4 pb-20">
          <h2 className="text-xl font-bold text-gray-800 mb-4 px-2">Histórico Recente</h2>
          {historico.map(p => (
            <GlassCard key={p.id} className="!p-6 flex justify-between items-center hover:shadow-lg transition-shadow border-l-4 border-l-brand-500/20">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-extrabold text-xl text-gray-900">R$ {p.valorTotal.toFixed(2)}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="flex flex-col gap-1">
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                     {new Date(p.data).toLocaleDateString()} • {new Date(p.data).toLocaleTimeString().slice(0,5)}
                   </p>
                   <p className="text-sm text-gray-600 mt-1 font-semibold">
                     {p.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ')}
                   </p>
                </div>
              </div>
              <div className="text-gray-300">
                <Icons.History />
              </div>
            </GlassCard>
          ))}
          {historico.length === 0 && (
            <div className="text-center py-16 bg-white/40 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300">
              <p className="text-gray-400 font-bold">Nenhum pedido realizado ainda.</p>
              <button onClick={() => setTab('MENU')} className="mt-4 text-brand-600 font-bold hover:underline">Ir para o Cardápio</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
