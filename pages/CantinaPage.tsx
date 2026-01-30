import React, { useState, useEffect, useMemo } from 'react';
import { Pedido, StatusPedido } from '../types';
import { loginAPI } from '../services/loginAPI';
import { GlassCard, GlassButton, StatusBadge, StatCard } from '../components/GlassUI';
import { Icons } from '../components/Icons';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Tipagem para o relatório financeiro
interface RelatorioCadete {
  id: string;
  nome: string;
  guerra: string;
  numero: string;
  totalGasto: number;
  ultimaCompra: string;
  qtdPedidos: number;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const CantinaPage: React.FC = () => {
  const [tab, setTab] = useState<'FILA' | 'RELATORIO'>('FILA');
  
  // --- Estados da Fila ---
  const [filaSubTab, setFilaSubTab] = useState<'ABERTO' | 'HISTORICO'>('ABERTO');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [vendasTotal, setVendasTotal] = useState(0);
  const [qtdPedidosHoje, setQtdPedidosHoje] = useState(0);

  // --- Estados do Relatório & Detalhes ---
  const [relatorio, setRelatorio] = useState<RelatorioCadete[]>([]);
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  
  // Filtro de Datas (Relatório)
  // Define o mês de referência atual por padrão
  const [refMonth, setRefMonth] = useState(new Date().getMonth());
  // Ano sempre atual
  
  // Modal de Detalhes
  const [selectedCadet, setSelectedCadet] = useState<RelatorioCadete | null>(null);
  const [cadetOrders, setCadetOrders] = useState<Pedido[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // --- Efeitos ---

  // Cálculo do período fiscal (Corrigido para regra X-2 a X-1)
  const fiscalPeriod = useMemo(() => {
    // Regra: Mês de Referência X = 20 do Mês (X-2) até 19 do Mês (X-1)
    // Ex: Março (Index 2) = Jan (Index 0) 20 a Fev (Index 1) 19.
    const currentYear = new Date().getFullYear();
    const startMonth = refMonth - 2;
    const endMonth = refMonth - 1;

    const startDate = new Date(currentYear, startMonth, 20, 0, 0, 0);
    const endDate = new Date(currentYear, endMonth, 19, 23, 59, 59);

    return { startDate, endDate };
  }, [refMonth]);

  // Carrega dados iniciais da fila e usuários
  useEffect(() => {
    // Carrega a lista de usuários base (sem filtro) apenas para uso na Fila (mapeamento)
    // Para o relatório oficial, o useEffect abaixo cuidará disso
    if (tab === 'FILA') {
        loginAPI.getRelatorioFinanceiro().then(setRelatorio);
        loadDataFila();
        const interval = setInterval(loadDataFila, 5000);
        return () => clearInterval(interval);
    }
  }, [tab]);

  // Atualiza relatório ao entrar na aba ou mudar o filtro
  useEffect(() => {
    if (tab === 'RELATORIO') {
      setLoadingRelatorio(true);
      // Passa as datas calculadas para o backend filtrar
      loginAPI.getRelatorioFinanceiro(fiscalPeriod.startDate, fiscalPeriod.endDate).then(data => {
        setRelatorio(data);
        setLoadingRelatorio(false);
      });
    }
  }, [tab, fiscalPeriod]);

  // --- Lógica da Fila ---

  const loadDataFila = async () => {
    if (loadingId) return;
    const all = await loginAPI.getPedidos();
    setPedidos(all);
    
    const hoje = new Date().toDateString();
    const pedidosHoje = all.filter(p => new Date(p.data).toDateString() === hoje);
    const pedidosValidos = pedidosHoje.filter(p => p.status !== StatusPedido.CANCELADO);
    
    setVendasTotal(pedidosValidos.reduce((acc, curr) => acc + curr.valorTotal, 0));
    setQtdPedidosHoje(pedidosValidos.length);
  };

  const handleStatus = async (id: string, status: StatusPedido) => {
    setLoadingId(id);
    try {
      const res = await loginAPI.atualizarStatusPedido(id, status);
      if (res.sucesso) {
        setPedidos(prev => prev.map(p => p.id === id ? { ...p, status } : p));
        await loadDataFila(); 
      } else {
        alert(res.mensagem || "Erro ao atualizar pedido.");
      }
    } catch (error) {
      console.error("Erro crítico na UI:", error);
      alert("Erro inesperado ao processar ação.");
    } finally {
      setLoadingId(null);
    }
  };

  // --- Agrupamento da Fila (Por Esquadrão/Ano) ---
  const groupedOrders = useMemo(() => {
    const pendentes = pedidos.filter(p => p.status === StatusPedido.PENDENTE);
    
    const groups: { [key: string]: Pedido[] } = {
      '1º Ano': [], '2º Ano': [], '3º Ano': [], '4º Ano': [], 'Outros': []
    };
    const currentYearShort = new Date().getFullYear() % 100;

    pendentes.forEach(pedido => {
      const cadete = relatorio.find(r => r.id === pedido.usuarioId);
      const numero = cadete?.numero || '';
      
      const prefixStr = numero.length >= 2 ? numero.substring(0, 2) : '00';
      const prefix = parseInt(prefixStr, 10);
      let anoCurso = (currentYearShort - prefix) + 1;
      
      let key = (anoCurso >= 1 && anoCurso <= 4) ? `${anoCurso}º Ano` : 'Outros';
      groups[key].push(pedido);
    });

    Object.keys(groups).forEach(key => {
        groups[key].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    });

    return groups;
  }, [pedidos, relatorio]);

  const orderedGroups = ['1º Ano', '2º Ano', '3º Ano', '4º Ano', 'Outros'];

  // --- Detalhes do Cadete (Relatório) ---
  const openCadetDetails = async (cadete: RelatorioCadete) => {
    setSelectedCadet(cadete);
    setLoadingDetails(true);
    const orders = await loginAPI.getPedidos(cadete.id);
    
    // Filtramos localmente para exibir no detalhe apenas o que compõe o saldo do relatório
    const filteredOrders = orders.filter(o => {
       const d = new Date(o.data);
       return d >= fiscalPeriod.startDate && d <= fiscalPeriod.endDate && o.status !== StatusPedido.CANCELADO;
    });

    setCadetOrders(filteredOrders);
    setLoadingDetails(false);
  };

  const closeDetails = () => {
    setSelectedCadet(null);
    setCadetOrders([]);
  };

  // --- Lógica do Relatório (Agrupamento) ---
  const groupedRelatorio = useMemo(() => {
    const groups: { [key: string]: RelatorioCadete[] } = {
      '1º Ano': [], '2º Ano': [], '3º Ano': [], '4º Ano': [], 'Outros': []
    };
    const currentYearShort = new Date().getFullYear() % 100;

    relatorio.forEach(cadete => {
      const prefixStr = cadete.numero ? cadete.numero.substring(0, 2) : '00';
      const prefix = parseInt(prefixStr, 10);
      let anoCurso = (currentYearShort - prefix) + 1;
      let key = (anoCurso >= 1 && anoCurso <= 4) ? `${anoCurso}º Ano` : 'Outros';
      groups[key].push(cadete);
    });
    return groups;
  }, [relatorio]);

  const totalGeralRelatorio = relatorio.reduce((acc, r) => acc + r.totalGasto, 0);

  // --- Funções de Exportação ---
  const getExportData = () => {
    return relatorio.map(r => ({
      'Número': r.numero,
      'Nome de Guerra': r.guerra,
      'Valor Total': r.totalGasto.toFixed(2)
    }));
  };

  const handleExportXLSX = () => {
    const currentYear = new Date().getFullYear();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(getExportData());
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
    XLSX.writeFile(wb, `relatorio_cantina_${MESES[refMonth]}_${currentYear}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const handleExportPDF = () => {
    const currentYear = new Date().getFullYear();
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Relatório da Cantina - ${MESES[refMonth]}/${currentYear}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Período: ${fiscalPeriod.startDate.toLocaleDateString()} a ${fiscalPeriod.endDate.toLocaleDateString()}`, 14, 24);
    
    const tableColumn = ["Número", "Nome de Guerra", "Valor Total (R$)"];
    const tableRows: any[] = [];

    relatorio.forEach(r => {
      const rowData = [r.numero, r.guerra, r.totalGasto.toFixed(2)];
      tableRows.push(rowData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
    });

    doc.save(`relatorio_cantina_${MESES[refMonth]}.pdf`);
    setIsExportMenuOpen(false);
  };

  const handleExportDOCX = () => {
    const currentYear = new Date().getFullYear();
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Relatório</title></head><body>`;
    let table = `<h2 style="font-family: Arial">Relatório Cantina - ${MESES[refMonth]}/${currentYear}</h2>`;
    table += `<p>Período: ${fiscalPeriod.startDate.toLocaleDateString()} a ${fiscalPeriod.endDate.toLocaleDateString()}</p>`;
    table += '<table border="1" style="border-collapse: collapse; width: 100%; font-family: Arial">';
    table += '<tr style="background-color: #eee"><th>Número</th><th>Nome</th><th>Total (R$)</th></tr>';
    relatorio.forEach(r => {
      table += `<tr><td>${r.numero}</td><td>${r.guerra}</td><td>${r.totalGasto.toFixed(2)}</td></tr>`;
    });
    table += '</table></body></html>';
    const source = header + table;
    const blob = new Blob(['\ufeff', source], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_cantina_${MESES[refMonth]}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  // --- Render ---

  return (
    <div className="space-y-8 relative">
      
      {/* Header com Abas Principais */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-2xl font-extrabold text-gray-800">Painel da Cantina</h2>
        <div className="flex p-1 bg-white rounded-xl border border-gray-200 shadow-sm w-full md:w-auto">
          <button 
            onClick={() => setTab('FILA')}
            className={`flex-1 md:w-40 py-2 text-sm font-bold rounded-lg transition-all ${tab === 'FILA' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Fila de Pedidos
          </button>
          <button 
            onClick={() => setTab('RELATORIO')}
            className={`flex-1 md:w-40 py-2 text-sm font-bold rounded-lg transition-all ${tab === 'RELATORIO' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Relatório Geral
          </button>
        </div>
      </div>

      {tab === 'FILA' ? (
        // === VIEW: FILA DE PEDIDOS ===
        <>
          {/* Dashboard Stats */}
          <div className="grid grid-cols-2 gap-6 animate-fade-in">
            <StatCard title="Vendas Hoje" value={`R$ ${vendasTotal.toFixed(2)}`} color="text-brand-600" icon={<Icons.Money />} />
            <StatCard title="Pedidos Hoje" value={qtdPedidosHoje} color="text-blue-600" icon={<span className="text-2xl">📦</span>} />
          </div>

          {/* Sub-menu da Fila */}
          <div className="mt-8">
            <div className="flex items-center gap-4 mb-6 border-b border-gray-200 pb-2">
               <button 
                 onClick={() => setFilaSubTab('ABERTO')}
                 className={`text-lg font-bold pb-2 px-2 transition-all ${filaSubTab === 'ABERTO' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
               >
                 Em Preparo
                 <span className={`ml-2 px-2 py-0.5 rounded-full text-xs align-middle ${filaSubTab === 'ABERTO' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                   {pedidos.filter(p => p.status === StatusPedido.PENDENTE).length}
                 </span>
               </button>
               <button 
                 onClick={() => setFilaSubTab('HISTORICO')}
                 className={`text-lg font-bold pb-2 px-2 transition-all ${filaSubTab === 'HISTORICO' ? 'text-gray-800 border-b-2 border-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
               >
                 Histórico do Dia
                 <span className={`ml-2 px-2 py-0.5 rounded-full text-xs align-middle ${filaSubTab === 'HISTORICO' ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-500'}`}>
                   {pedidos.filter(p => p.status !== StatusPedido.PENDENTE && new Date(p.data).toDateString() === new Date().toDateString()).length}
                 </span>
               </button>
            </div>

            <div className="animate-slide-up">
              {filaSubTab === 'ABERTO' ? (
                // --- Lista Agrupada por Esquadrão ---
                <div className="space-y-8">
                   {orderedGroups.map(turma => {
                     const pedidosTurma = groupedOrders[turma];
                     if (pedidosTurma.length === 0) return null;

                     return (
                       <div key={turma}>
                         <h3 className="text-gray-500 font-bold uppercase text-xs tracking-wider mb-3 flex items-center gap-2">
                           <span className="w-2 h-2 rounded-full bg-brand-500"></span>
                           {turma} ({pedidosTurma.length})
                         </h3>
                         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                           {pedidosTurma.map(p => (
                             <GlassCard key={p.id} className="p-6 border-l-[6px] border-l-brand-500 shadow-sm hover:shadow-md transition-all">
                               <div className="flex justify-between items-start mb-4">
                                 <div>
                                   <div className="flex items-center gap-2">
                                     <h4 className="font-extrabold text-xl text-gray-900">{p.usuarioGuerra}</h4>
                                     <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded font-bold uppercase">{turma}</span>
                                   </div>
                                   <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1 mt-1">
                                     <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse"></span>
                                     Pedido às {new Date(p.data).toLocaleTimeString().slice(0, 5)}
                                   </span>
                                 </div>
                                 <div className="text-right">
                                   <span className="block font-extrabold text-lg text-emerald-600">
                                     R$ {p.valorTotal.toFixed(2)}
                                   </span>
                                 </div>
                               </div>
                               
                               <div className="bg-brand-50/50 p-4 rounded-xl mb-4 border border-brand-100/50">
                                 {p.itens.map((i, idx) => (
                                   <div key={idx} className="flex justify-between border-b border-gray-200/50 last:border-0 pb-2 last:pb-0 mb-2 last:mb-0">
                                     <span className="text-gray-800 font-bold text-lg">{i.quantidade}x <span className="font-medium text-gray-600 text-base">{i.nome}</span></span>
                                   </div>
                                 ))}
                               </div>

                               <div className="flex gap-3 pt-2">
                                 <GlassButton variant="primary" onClick={() => handleStatus(p.id, StatusPedido.CONCLUIDO)} disabled={loadingId === p.id} className="py-3 text-sm flex-1 bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20">
                                   {loadingId === p.id ? '...' : '✅ Entregar'}
                                 </GlassButton>
                                 <GlassButton variant="secondary" onClick={() => handleStatus(p.id, StatusPedido.CANCELADO)} disabled={loadingId === p.id} className="py-3 text-sm text-red-600 border-red-100 hover:bg-red-50 flex-1">
                                   {loadingId === p.id ? '...' : 'Cancelar'}
                                 </GlassButton>
                               </div>
                             </GlassCard>
                           ))}
                         </div>
                       </div>
                     );
                   })}
                   
                   {pedidos.filter(p => p.status === StatusPedido.PENDENTE).length === 0 && (
                      <div className="text-center py-16 bg-white/50 rounded-3xl border border-dashed border-gray-200">
                        <div className="text-5xl mb-4">👨‍🍳</div>
                        <p className="text-gray-400 font-bold">Tudo limpo! Sem pedidos pendentes.</p>
                      </div>
                   )}
                </div>
              ) : (
                // --- Lista Histórico (Minimizada) ---
                <div className="space-y-3 opacity-80">
                   {pedidos.filter(p => p.status !== StatusPedido.PENDENTE).map(p => (
                     <div key={p.id} className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center grayscale hover:grayscale-0 transition-all">
                        <div>
                          <span className="font-bold text-gray-700 block">{p.usuarioGuerra}</span>
                          <span className="text-xs text-gray-400">{new Date(p.data).toLocaleTimeString()} • {p.itens.length} itens</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge status={p.status} />
                          <span className="text-sm font-mono font-bold">R$ {p.valorTotal.toFixed(2)}</span>
                        </div>
                     </div>
                   ))}
                   {pedidos.filter(p => p.status !== StatusPedido.PENDENTE).length === 0 && (
                     <p className="text-center text-gray-400 py-8 text-sm">Nenhum pedido finalizado hoje.</p>
                   )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        // === VIEW: RELATÓRIO GERAL ===
        <div className="animate-fade-in relative">
          
          {/* Filtro de Mês/Ano */}
          <GlassCard className="mb-6 !p-4 flex flex-col md:flex-row items-center justify-between gap-4 border-l-4 border-l-brand-500">
             <div className="flex items-center gap-2">
                <div className="bg-brand-100 text-brand-700 p-2 rounded-lg">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                   </svg>
                </div>
                <div>
                   <h3 className="font-bold text-gray-800 text-sm">Período de Referência</h3>
                   <p className="text-xs text-gray-500 font-medium">
                     {fiscalPeriod.startDate.toLocaleDateString()} a {fiscalPeriod.endDate.toLocaleDateString()}
                   </p>
                </div>
             </div>
             
             <div className="flex items-center gap-2 w-full md:w-auto">
                <select 
                   value={refMonth} 
                   onChange={(e) => setRefMonth(Number(e.target.value))}
                   className="flex-1 bg-white border border-gray-300 text-gray-700 font-bold text-sm rounded-lg p-2.5 focus:ring-brand-500 focus:border-brand-500 outline-none"
                >
                   {MESES.map((mes, idx) => (
                      <option key={idx} value={idx}>{mes}</option>
                   ))}
                </select>
                {/* Seletor de Ano Removido - Sempre usa ano atual */}
             </div>
          </GlassCard>

          {/* Header do Relatório */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <div>
              <p className="text-gray-500 font-medium">Total Acumulado ({MESES[refMonth]})</p>
              <h2 className="text-3xl font-extrabold text-brand-600">R$ {totalGeralRelatorio.toFixed(2)}</h2>
            </div>
            
            {/* Botão de Exportação */}
            <div className="relative">
               <button 
                 onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                 className="flex items-center gap-2 bg-brand-50 text-brand-700 px-6 py-3 rounded-xl font-bold hover:bg-brand-100 transition-colors border border-brand-200"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                 </svg>
                 Exportar Relatório
               </button>

               {/* Dropdown Menu */}
               {isExportMenuOpen && (
                 <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fade-in">
                   <div className="p-2 space-y-1">
                      <button onClick={handleExportXLSX} className="w-full text-left px-4 py-3 hover:bg-green-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                         <span className="text-green-600 text-lg">📊</span> Excel (.xlsx)
                      </button>
                      <button onClick={handleExportPDF} className="w-full text-left px-4 py-3 hover:bg-red-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                         <span className="text-red-500 text-lg">📄</span> PDF (.pdf)
                      </button>
                      <button onClick={handleExportDOCX} className="w-full text-left px-4 py-3 hover:bg-blue-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                         <span className="text-blue-600 text-lg">📝</span> Word (.doc)
                      </button>
                   </div>
                 </div>
               )}
            </div>
          </div>

          {/* Overlay para fechar dropdown */}
          {isExportMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setIsExportMenuOpen(false)}></div>}

          {loadingRelatorio && <div className="p-12 text-center text-gray-400 font-bold">Carregando relatório...</div>}

          {!loadingRelatorio && orderedGroups.map(turma => {
            const cadetesTurma = groupedRelatorio[turma];
            if (cadetesTurma.length === 0) return null;
            const totalTurma = cadetesTurma.reduce((acc, c) => acc + c.totalGasto, 0);

            return (
              <div key={turma} className="mb-8">
                <div className="flex items-center gap-4 mb-3">
                   <h3 className="text-xl font-bold text-gray-700 pl-3 border-l-4 border-brand-500">{turma}</h3>
                   <span className="text-xs bg-gray-200 px-3 py-1 rounded-full text-gray-600 font-bold">R$ {totalTurma.toFixed(2)}</span>
                </div>
                <GlassCard className="overflow-hidden p-0 border border-gray-200 shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                          <th className="p-5 font-bold w-24">Nº</th>
                          <th className="p-5 font-bold">Guerra</th>
                          <th className="p-5 font-bold text-center">Qtd</th>
                          <th className="p-5 font-bold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {cadetesTurma.map(r => (
                          <tr 
                            key={r.id} 
                            onClick={() => openCadetDetails(r)}
                            className="hover:bg-brand-50 transition-colors text-sm cursor-pointer group"
                          >
                            <td className="p-5 font-mono text-brand-600 font-bold">{r.numero}</td>
                            <td className="p-5 font-bold text-gray-800 flex items-center gap-2">
                              {r.guerra}
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-300 group-hover:text-brand-50 opacity-0 group-hover:opacity-100 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </td>
                            <td className="p-5 text-center text-gray-600 font-medium">{r.qtdPedidos}</td>
                            <td className="p-5 text-right font-mono text-gray-900 font-bold text-base">R$ {r.totalGasto.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              </div>
            );
          })}
        </div>
      )}

      {/* --- MODAL DE DETALHES --- */}
      {selectedCadet && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in" onClick={closeDetails}>
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <GlassCard className="flex flex-col h-full p-0 overflow-hidden shadow-2xl">
              
              {/* Header do Modal */}
              <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-extrabold text-gray-900 mb-1">
                    {selectedCadet.numero} - {selectedCadet.guerra}
                  </h3>
                  <p className="text-gray-500 font-medium text-sm">{selectedCadet.nome}</p>
                  <p className="text-gray-400 text-xs mt-1">
                    Período: {fiscalPeriod.startDate.toLocaleDateString()} a {fiscalPeriod.endDate.toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <button onClick={closeDetails} className="bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-full p-2 transition-colors mb-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <div className="text-3xl font-extrabold text-brand-600">R$ {selectedCadet.totalGasto.toFixed(2)}</div>
                </div>
              </div>

              {/* Corpo do Modal (Lista) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
                {loadingDetails ? (
                  <div className="text-center py-10 text-gray-400 font-bold animate-pulse">Carregando histórico detalhado...</div>
                ) : cadetOrders.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-300 text-5xl mb-2">🧾</div>
                    <div className="text-gray-500 font-medium">Nenhum pedido registrado neste período.</div>
                  </div>
                ) : (
                  cadetOrders.map(pedido => (
                    <div key={pedido.id} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-center mb-4 border-b border-gray-50 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-extrabold text-lg">R$ {pedido.valorTotal.toFixed(2)}</span>
                          <span className="text-gray-300">•</span>
                          <span className="text-gray-500 text-sm font-medium">
                            {new Date(pedido.data).toLocaleDateString()} às {new Date(pedido.data).toLocaleTimeString().slice(0,5)}
                          </span>
                        </div>
                        <StatusBadge status={pedido.status} />
                      </div>
                      
                      <div className="space-y-2">
                        {pedido.itens.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm text-gray-600">
                            <span className="font-bold text-gray-800">{item.quantidade}x <span className="font-normal">{item.nome}</span></span>
                            <span className="text-gray-400 font-mono">R$ {(item.preco * item.quantidade).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      )}

    </div>
  );
};
