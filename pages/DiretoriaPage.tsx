import React, { useState, useEffect, useMemo } from 'react';
import { mockBackend } from '../services/mockBackend';
import { GlassCard, GlassButton, StatusBadge } from '../components/GlassUI';
import { Pedido } from '../types';

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

export const DiretoriaPage: React.FC = () => {
  const [relatorio, setRelatorio] = useState<RelatorioCadete[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros de Data (Mês Fiscal)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  // Ano sempre atual
  
  // Estados para o Modal de Detalhes
  const [selectedCadet, setSelectedCadet] = useState<RelatorioCadete | null>(null);
  const [historicoDetalhado, setHistoricoDetalhado] = useState<Pedido[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Cálculo do Período Fiscal
  // Regra: Mês de Referência X = 20 do Mês (X-2) até 19 do Mês (X-1)
  const fiscalPeriod = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startMonth = selectedMonth - 2;
    const endMonth = selectedMonth - 1;
    
    const startDate = new Date(currentYear, startMonth, 20, 0, 0, 0);
    const endDate = new Date(currentYear, endMonth, 19, 23, 59, 59);

    return { startDate, endDate };
  }, [selectedMonth]);

  useEffect(() => {
    setLoading(true);
    // Passa as datas para o backend filtrar
    mockBackend.getRelatorioFinanceiro(fiscalPeriod.startDate, fiscalPeriod.endDate).then(data => {
      setRelatorio(data);
      setLoading(false);
    });
  }, [fiscalPeriod]);

  // Função para exportar CSV
  const handleExport = () => {
    // Cabeçalho
    const header = ['Número,Nome,Valor total'];
    
    // Linhas
    const rows = relatorio.map(item => {
      // Formata o número para garantir string e valor para 2 casas decimais
      return `${item.numero},${item.guerra},${item.totalGasto.toFixed(2)}`;
    });

    // Junta tudo com quebra de linha
    const csvContent = [header, ...rows].join('\n');

    // Cria o Blob com BOM para acentuação correta no Excel
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Cria link temporário para download
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `relatorio_cantina_${MESES[selectedMonth]}_${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Função para abrir o modal e carregar histórico
  const handleCadetClick = async (cadete: RelatorioCadete) => {
    setSelectedCadet(cadete);
    setLoadingHistorico(true);
    // Busca os pedidos filtrados pelo ID do usuário
    const pedidos = await mockBackend.getPedidos(cadete.id);
    
    // Filtra localmente os pedidos para bater com o período fiscal selecionado
    const pedidosFiltrados = pedidos.filter(p => {
        const d = new Date(p.data);
        return d >= fiscalPeriod.startDate && d <= fiscalPeriod.endDate && p.status !== 'CANCELADO';
    });

    setHistoricoDetalhado(pedidosFiltrados);
    setLoadingHistorico(false);
  };

  const closeModal = () => {
    setSelectedCadet(null);
    setHistoricoDetalhado([]);
  };

  // Lógica de Agrupamento por Turma
  const groupedData = useMemo(() => {
    const groups: { [key: string]: RelatorioCadete[] } = {
      '1º Ano': [],
      '2º Ano': [],
      '3º Ano': [],
      '4º Ano': [],
      'Outros': []
    };

    const currentYearShort = new Date().getFullYear() % 100;

    relatorio.forEach(cadete => {
      const prefixStr = cadete.numero ? cadete.numero.substring(0, 2) : '00';
      const prefix = parseInt(prefixStr, 10);
      let anoCurso = (currentYearShort - prefix) + 1;
      
      let key = 'Outros';
      if (anoCurso >= 1 && anoCurso <= 4) {
        key = `${anoCurso}º Ano`;
      }

      groups[key].push(cadete);
    });

    return groups;
  }, [relatorio]);

  const totalGeral = relatorio.reduce((acc, r) => acc + r.totalGasto, 0);
  const orderedKeys = ['1º Ano', '2º Ano', '3º Ano', '4º Ano', 'Outros'];

  return (
    <div className="space-y-8 relative">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between items-center mb-6 gap-4">
        <div className="w-full flex justify-between items-start md:items-center">
            <div>
              <h2 className="text-2xl font-extrabold text-gray-800">Diretoria de Cédula</h2>
              <p className="text-gray-500 font-medium">Controle Financeiro</p>
            </div>
            
            {/* Seletor de Data - Apenas Mês */}
            <GlassCard className="!p-2 flex gap-2 items-center bg-gray-50 border border-gray-200">
               <div className="px-2">
                 <span className="block text-[10px] font-bold text-gray-400 uppercase">Referência</span>
                 <select 
                     value={selectedMonth} 
                     onChange={(e) => setSelectedMonth(Number(e.target.value))}
                     className="bg-transparent text-sm font-bold text-brand-600 outline-none cursor-pointer"
                  >
                     {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
               </div>
            </GlassCard>
        </div>

        <div className="w-full flex flex-col md:flex-row items-center justify-between gap-6 pt-4 border-t border-gray-100">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Montante Total ({MESES[selectedMonth]})</span>
            <span className="text-3xl font-extrabold text-brand-600">R$ {totalGeral.toFixed(2)}</span>
            <p className="text-[10px] text-gray-400 mt-1">
               {fiscalPeriod.startDate.toLocaleDateString()} até {fiscalPeriod.endDate.toLocaleDateString()}
            </p>
          </div>
          <button 
            onClick={handleExport}
            className="w-full md:w-auto bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar CSV
          </button>
        </div>
      </div>

      {loading && <div className="p-12 text-center text-gray-400 font-bold">Carregando dados financeiros...</div>}

      {!loading && orderedKeys.map(turma => {
        const cadetesTurma = groupedData[turma];
        if (cadetesTurma.length === 0) return null;
        
        const totalTurma = cadetesTurma.reduce((acc, c) => acc + c.totalGasto, 0);

        return (
          <div key={turma} className="animate-fade-in">
            <div className="flex items-center gap-4 mb-3">
               <h3 className="text-xl font-bold text-gray-700 pl-3 border-l-4 border-brand-500">
                 {turma}
               </h3>
               <span className="text-xs bg-gray-200 px-3 py-1 rounded-full text-gray-600 font-bold">
                 Total da Turma: R$ {totalTurma.toFixed(2)}
               </span>
            </div>
            
            <GlassCard className="overflow-hidden p-0 mb-8 border border-gray-200 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="p-5 font-bold w-24">Nº</th>
                      <th className="p-5 font-bold">Nome de Guerra</th>
                      <th className="p-5 font-bold hidden md:table-cell">Nome Completo</th>
                      <th className="p-5 font-bold text-center">Pedidos</th>
                      <th className="p-5 font-bold text-right">Devido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cadetesTurma.map(r => (
                      <tr 
                        key={r.id} 
                        onClick={() => handleCadetClick(r)}
                        className="hover:bg-brand-50 transition-colors text-sm cursor-pointer group"
                      >
                        <td className="p-5 font-mono text-brand-600 font-bold">{r.numero}</td>
                        <td className="p-5 font-bold text-gray-800">{r.guerra}</td>
                        <td className="p-5 text-gray-500 hidden md:table-cell">{r.nome}</td>
                        <td className="p-5 text-center text-gray-600 font-medium">{r.qtdPedidos}</td>
                        <td className="p-5 text-right font-mono text-gray-900 font-bold text-base">
                          R$ {r.totalGasto.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        );
      })}

      {/* Modal de Detalhes - Estilo Clean */}
      {selectedCadet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col">
            <GlassCard className="flex flex-col h-full p-0 overflow-hidden shadow-2xl">
              
              {/* Header do Modal */}
              <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-extrabold text-gray-900 mb-1">
                    {selectedCadet.numero} - {selectedCadet.guerra}
                  </h3>
                  <p className="text-gray-500 font-medium text-sm">{selectedCadet.nome}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Gasto</div>
                  <div className="text-3xl font-extrabold text-brand-600">R$ {selectedCadet.totalGasto.toFixed(2)}</div>
                </div>
              </div>

              {/* Corpo do Modal (Lista) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
                {loadingHistorico ? (
                  <div className="text-center py-10 text-gray-400">Carregando histórico...</div>
                ) : historicoDetalhado.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-300 text-5xl mb-2">🧾</div>
                    <div className="text-gray-500 font-medium">Nenhum pedido registrado neste período.</div>
                  </div>
                ) : (
                  historicoDetalhado.map(pedido => (
                    <div key={pedido.id} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-center mb-4 border-b border-gray-50 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-extrabold text-lg">R$ {pedido.valorTotal.toFixed(2)}</span>
                          <span className="text-gray-300">•</span>
                          <span className="text-gray-500 text-sm font-medium">
                            {new Date(pedido.data).toLocaleDateString()}
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

              {/* Footer do Modal */}
              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <GlassButton variant="secondary" onClick={closeModal} className="w-full">
                  Fechar
                </GlassButton>
              </div>

            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
};
