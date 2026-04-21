import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Pedido, StatusPedido, Usuario } from '../types';
import { loginAPI } from '../services/loginAPI';
import { GlassCard, GlassButton, StatusBadge, StatCard } from '../components/GlassUI';
import { Icons } from '../components/Icons';
import { getEsquadrao } from '../utils';
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
  totalCantina: number;
  totalCidade: number;
  ultimaCompra: string;
  qtdPedidos: number;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const CantinaPage: React.FC = () => {
  const [painel, setPainel] = useState<'CANTINA' | 'CIDADE'>('CANTINA');
  const [tab, setTab] = useState<'FILA' | 'RELATORIO' | 'SALGADADAS'>('FILA');
  
  // --- Estados da Fila ---
  const [filaSubTab, setFilaSubTab] = useState<'ABERTO' | 'HISTORICO'>('ABERTO');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [vendasTotal, setVendasTotal] = useState(0);
  const [qtdPedidosHoje, setQtdPedidosHoje] = useState(0);

  // --- Estados Salgadada ---
  const [eventosSalgadada, setEventosSalgadada] = useState<any[]>([]);
  const [loadingSalgadadas, setLoadingSalgadadas] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]); // Lista completa de usuários para rateio

  // --- Estados do Relatório & Detalhes ---
  const [relatorio, setRelatorio] = useState<RelatorioCadete[]>([]);
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  
  // Relatório Diário
  const [isDailyReportModalOpen, setIsDailyReportModalOpen] = useState(false);
  const [dailyReportDate, setDailyReportDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Filtro de Datas (Relatório)
  // Define o mês de referência atual por padrão (Ajustado para regra fiscal)
  const [refMonth, setRefMonth] = useState(() => {
    const hoje = new Date();
    const dia = hoje.getDate();
    const mes = hoje.getMonth();
    // Se dia >= 20, o mês de referência é 2 meses à frente (ex: 20/Fev -> Abril)
    // Se dia < 20, o mês de referência é 1 mês à frente (ex: 10/Mar -> Abril)
    const target = dia >= 20 ? mes + 2 : mes + 1;
    return target % 12;
  });
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

  // Carrega dados iniciais globais
  useEffect(() => {
    // Carrega usuários para uso no rateio de salgadadas
    loginAPI.getUsuariosParaSalgadada().then(setUsuarios);

    // Carrega salgadadas globalmente para a notificação (badge) poder funcionar em qualquer aba
    const loadSalgadadasGlobally = async () => {
      try {
        const data = await loginAPI.getEventosSalgadada();
        setEventosSalgadada(data);
      } catch (e) {
        console.error("Erro ao carregar salgadadas globalmente", e);
      }
    };

    loadSalgadadasGlobally();
    const interval = setInterval(loadSalgadadasGlobally, 8000);
    return () => clearInterval(interval);
  }, []);

  // Atualiza Fila
  useEffect(() => {
    if (tab === 'FILA') {
        loginAPI.getRelatorioFinanceiro().then(setRelatorio);
        loadDataFila();
        const interval = setInterval(loadDataFila, 5000);
        return () => clearInterval(interval);
    }
  }, [tab, painel]);

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
  }, [tab, fiscalPeriod, painel]);

  // --- Lógica da Fila ---

  const loadDataFila = async () => {
    if (loadingId) return;
    const all = await loginAPI.getPedidos(undefined, painel); // Passa a origem (CANTINA ou CIDADE)
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

  const handleStatusSalgadada = async (id: string, status: StatusPedido) => {
    console.log('>>> handleStatusSalgadada CHAMADO para ID:', id, 'Status:', status);
    
    // Removido check de loading para garantir que o clique sempre funcione para debug
    // if (loadingSalgadadas) return;

    // Confirmações removidas conforme solicitado
    // if (status === StatusPedido.CONCLUIDO && !window.confirm('Confirmar entrega desta salgadada? Isso marcará o evento como CONCLUÍDO.')) return;
    // if (status === StatusPedido.CANCELADO && !window.confirm('Tem certeza que deseja CANCELAR esta salgadada?')) return;

    setLoadingSalgadadas(true);
    try {
      console.log(`Iniciando atualização de status salgadada ${id} para ${status}`);
      const res = await loginAPI.atualizarStatusEventoSalgadada(id, status);
      
      if (res.sucesso) {
        console.log('Sucesso na atualização, atualizando estado local...');
        // Atualização Otimista
        setEventosSalgadada(prev => prev.map(e => e.id === id ? { ...e, status } : e));
        
        // Recarrega em background para garantir consistência
        const data = await loginAPI.getEventosSalgadada();
        setEventosSalgadada(data);
      } else {
        console.error('Erro retornado pela API:', res.mensagem);
        alert(res.mensagem || "Erro ao atualizar salgadada.");
      }
    } catch (error) {
      console.error("Erro crítico na UI (Salgadada):", error);
      alert("Erro inesperado ao processar ação.");
    } finally {
      setLoadingSalgadadas(false);
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

  // Calcula o total geral baseado no painel selecionado
  const totalGeralRelatorio = relatorio.reduce((acc, r) => {
    const valor = painel === 'CANTINA' ? (r.totalCantina || 0) : (r.totalCidade || 0);
    return acc + valor;
  }, 0);

  // --- Funções de Exportação ---
  
  const getGroupedData = () => {
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
  };

  const handleExportXLSX = () => {
    const currentYear = new Date().getFullYear();
    const groups = getGroupedData();
    const wb = XLSX.utils.book_new();
    
    const titulo = painel === 'CANTINA' ? "Relatório Financeiro - Cantina" : "Relatório Financeiro - Loja da Cidade";
    const nomeArquivo = painel === 'CANTINA' ? `cantina_financeiro_${MESES[refMonth]}` : `cidade_financeiro_${MESES[refMonth]}`;

    // Aba Geral
    const wsData = [
      [titulo, `Referência: ${MESES[refMonth]}/${currentYear}`],
      ["Período", `${fiscalPeriod.startDate.toLocaleDateString()} a ${fiscalPeriod.endDate.toLocaleDateString()}`],
      [],
      ["Número", "Nome de Guerra", "Nome Completo", "Turma", "Quantidade de Pedidos", "Total Gasto (R$)"]
    ];

    let totalGeral = 0;

    Object.keys(groups).forEach(turma => {
      if (groups[turma].length > 0) {
        let totalTurma = 0;
        groups[turma].forEach(r => {
          const valor = painel === 'CANTINA' ? r.totalCantina : r.totalCidade;
          if (valor > 0) {
             wsData.push([r.numero, r.guerra, r.nome, turma, r.qtdPedidos.toString(), valor.toFixed(2)]);
             totalTurma += valor;
          }
        });
        
        if (totalTurma > 0) {
            // Linha de Total da Turma
            wsData.push(["", "", `TOTAL ${turma.toUpperCase()}`, "", "", totalTurma.toFixed(2)]);
            wsData.push([]); // Espaço
            totalGeral += totalTurma;
        }
      }
    });

    wsData.push(["", "", "TOTAL GERAL", "", "", totalGeral.toFixed(2)]);

    // --- RESUMO FINAL (TOTAIS POR ESQUADRÃO) ---
    wsData.push([]);
    wsData.push([]);
    wsData.push(["------------------------------------------------------------"]);
    wsData.push(["RESUMO GERAL POR ESQUADRÃO"]);
    wsData.push(["Esquadrão", "Total Cantina (R$)", "Total Cidade (R$)", "Total Geral (R$)"]);

    let somaCantina = 0;
    let somaCidade = 0;
    let somaGeral = 0;

    Object.keys(groups).forEach(turma => {
        if (turma === 'Outros') return; 
        
        const totalTurmaCantina = groups[turma].reduce((acc, r) => acc + r.totalCantina, 0);
        const totalTurmaCidade = groups[turma].reduce((acc, r) => acc + r.totalCidade, 0);
        const totalTurmaGeral = totalTurmaCantina + totalTurmaCidade;

        wsData.push([
            turma, 
            totalTurmaCantina.toFixed(2), 
            totalTurmaCidade.toFixed(2), 
            totalTurmaGeral.toFixed(2)
        ]);

        somaCantina += totalTurmaCantina;
        somaCidade += totalTurmaCidade;
        somaGeral += totalTurmaGeral;
    });

    wsData.push([
        "TOTAL ACUMULADO", 
        somaCantina.toFixed(2), 
        somaCidade.toFixed(2), 
        somaGeral.toFixed(2)
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Resumo Financeiro");
    XLSX.writeFile(wb, `${nomeArquivo}_${currentYear}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const handleExportSeparatedXLSX = () => {
    const currentYear = new Date().getFullYear();
    const groups = getGroupedData();
    const wb = XLSX.utils.book_new();
    
    // Aba Geral
    const wsData = [
      ["Relatório Financeiro Detalhado (Cantina vs Cidade)", `Referência: ${MESES[refMonth]}/${currentYear}`],
      ["Período", `${fiscalPeriod.startDate.toLocaleDateString()} a ${fiscalPeriod.endDate.toLocaleDateString()}`],
      [],
      ["Número", "Nome de Guerra", "Nome Completo", "Turma", "Qtd Pedidos", "Cantina (R$)", "Cidade (R$)", "Total (R$)"]
    ];

    let totalGeralCantina = 0;
    let totalGeralCidade = 0;
    let totalGeral = 0;

    Object.keys(groups).forEach(turma => {
      if (groups[turma].length > 0) {
        let totalTurmaCantina = 0;
        let totalTurmaCidade = 0;
        let totalTurma = 0;

        groups[turma].forEach(r => {
          wsData.push([
            r.numero, 
            r.guerra, 
            r.nome, 
            turma, 
            r.qtdPedidos.toString(), 
            r.totalCantina.toFixed(2),
            r.totalCidade.toFixed(2),
            r.totalGasto.toFixed(2)
          ]);
          totalTurmaCantina += r.totalCantina;
          totalTurmaCidade += r.totalCidade;
          totalTurma += r.totalGasto;
        });
        
        // Linha de Total da Turma
        wsData.push(["", "", `TOTAL ${turma.toUpperCase()}`, "", "", totalTurmaCantina.toFixed(2), totalTurmaCidade.toFixed(2), totalTurma.toFixed(2)]);
        wsData.push([]); // Espaço
        
        totalGeralCantina += totalTurmaCantina;
        totalGeralCidade += totalTurmaCidade;
        totalGeral += totalTurma;
      }
    });

    wsData.push(["", "", "TOTAL GERAL", "", "", totalGeralCantina.toFixed(2), totalGeralCidade.toFixed(2), totalGeral.toFixed(2)]);

    // --- RESUMO FINAL (TOTAIS POR ESQUADRÃO) ---
    wsData.push([]);
    wsData.push([]);
    wsData.push(["------------------------------------------------------------"]);
    wsData.push(["RESUMO GERAL POR ESQUADRÃO"]);
    wsData.push(["Esquadrão", "Total Cantina (R$)", "Total Cidade (R$)", "Total Geral (R$)"]);

    let somaCantina = 0;
    let somaCidade = 0;
    let somaGeral = 0;

    Object.keys(groups).forEach(turma => {
        if (turma === 'Outros') return; 
        
        const totalTurmaCantina = groups[turma].reduce((acc, r) => acc + r.totalCantina, 0);
        const totalTurmaCidade = groups[turma].reduce((acc, r) => acc + r.totalCidade, 0);
        const totalTurmaGeral = totalTurmaCantina + totalTurmaCidade;

        wsData.push([
            turma, 
            totalTurmaCantina.toFixed(2), 
            totalTurmaCidade.toFixed(2), 
            totalTurmaGeral.toFixed(2)
        ]);

        somaCantina += totalTurmaCantina;
        somaCidade += totalTurmaCidade;
        somaGeral += totalTurmaGeral;
    });

    wsData.push([
        "TOTAL ACUMULADO", 
        somaCantina.toFixed(2), 
        somaCidade.toFixed(2), 
        somaGeral.toFixed(2)
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Relatório Detalhado");
    XLSX.writeFile(wb, `relatorio_separado_${MESES[refMonth]}_${currentYear}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const handleExportUnifiedPDF = () => {
    const currentYear = new Date().getFullYear();
    const doc = new jsPDF();
    const groups = getGroupedData();
    
    doc.setFontSize(16);
    doc.text(`Relatório Financeiro Integrado - ${MESES[refMonth]}/${currentYear}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Período: ${fiscalPeriod.startDate.toLocaleDateString()} a ${fiscalPeriod.endDate.toLocaleDateString()}`, 14, 24);
    
    const tableRows: any[] = [];
    let totalGeralCantina = 0;
    let totalGeralCidade = 0;
    let totalGeral = 0;

    Object.keys(groups).forEach(turma => {
      if (groups[turma].length > 0) {
        // Cabeçalho da Turma
        tableRows.push([{ content: turma.toUpperCase(), colSpan: 6, styles: { fillColor: [220, 220, 220], fontStyle: 'bold' } }]);
        
        let totalTurmaCantina = 0;
        let totalTurmaCidade = 0;
        let totalTurma = 0;

        groups[turma].forEach(r => {
          tableRows.push([
             r.numero, 
             r.guerra, 
             r.qtdPedidos, 
             `R$ ${r.totalCantina.toFixed(2)}`,
             `R$ ${r.totalCidade.toFixed(2)}`,
             `R$ ${r.totalGasto.toFixed(2)}`
          ]);
          totalTurmaCantina += r.totalCantina;
          totalTurmaCidade += r.totalCidade;
          totalTurma += r.totalGasto;
        });
        
        // Total da Turma
        tableRows.push([{ 
            content: `Total ${turma}:   Cantina: R$ ${totalTurmaCantina.toFixed(2)}   Cidade: R$ ${totalTurmaCidade.toFixed(2)}   Total: R$ ${totalTurma.toFixed(2)}`, 
            colSpan: 6, 
            styles: { fontStyle: 'bold', halign: 'right' } 
        }]);
        
        totalGeralCantina += totalTurmaCantina;
        totalGeralCidade += totalTurmaCidade;
        totalGeral += totalTurma;
      }
    });

    // Total Geral
    tableRows.push([{ 
        content: `TOTAL GERAL:   Cantina: R$ ${totalGeralCantina.toFixed(2)}   Cidade: R$ ${totalGeralCidade.toFixed(2)}   Total: R$ ${totalGeral.toFixed(2)}`, 
        colSpan: 6, 
        styles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold', halign: 'right' } 
    }]);

    autoTable(doc, {
      head: [["Número", "Nome de Guerra", "Qtd", "Cantina", "Cidade", "Total"]],
      body: tableRows,
      startY: 30,
    });

    // --- RESUMO FINAL (TOTAIS POR ESQUADRÃO) ---
    doc.addPage();
    doc.setFontSize(14);
    doc.text("Resumo Geral por Esquadrão", 14, 20);
    
    const summaryRows: any[] = [];
    let somaCantina = 0;
    let somaCidade = 0;
    let somaGeral = 0;

    Object.keys(groups).forEach(turma => {
        if (turma === 'Outros') return;
        
        const totalTurmaCantina = groups[turma].reduce((acc, r) => acc + r.totalCantina, 0);
        const totalTurmaCidade = groups[turma].reduce((acc, r) => acc + r.totalCidade, 0);
        const totalTurmaGeral = totalTurmaCantina + totalTurmaCidade;

        summaryRows.push([
            turma, 
            `R$ ${totalTurmaCantina.toFixed(2)}`, 
            `R$ ${totalTurmaCidade.toFixed(2)}`, 
            `R$ ${totalTurmaGeral.toFixed(2)}`
        ]);

        somaCantina += totalTurmaCantina;
        somaCidade += totalTurmaCidade;
        somaGeral += totalTurmaGeral;
    });

    summaryRows.push([
        { content: "TOTAL ACUMULADO", styles: { fontStyle: 'bold' } },
        { content: `R$ ${somaCantina.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        { content: `R$ ${somaCidade.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        { content: `R$ ${somaGeral.toFixed(2)}`, styles: { fontStyle: 'bold', fillColor: [245, 158, 11], textColor: 255 } }
    ]);

    autoTable(doc, {
      head: [["Esquadrão", "Total Cantina", "Total Cidade", "Total Geral"]],
      body: summaryRows,
      startY: 30,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 248, 255] },
      styles: { fontSize: 12, cellPadding: 6 }
    });

    doc.save(`relatorio_integrado_${MESES[refMonth]}.pdf`);
    setIsExportMenuOpen(false);
  };

  const handleExportDOCX = () => {
    const currentYear = new Date().getFullYear();
    const groups = getGroupedData();
    
    const titulo = painel === 'CANTINA' ? "Relatório Cantina" : "Relatório Loja da Cidade";
    const nomeArquivo = painel === 'CANTINA' ? `cantina_relatorio_${MESES[refMonth]}` : `cidade_relatorio_${MESES[refMonth]}`;

    let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Relatório</title></head><body>`;
    html += `<h2 style="font-family: Arial">${titulo} - ${MESES[refMonth]}/${currentYear}</h2>`;
    html += `<p style="font-family: Arial">Período: ${fiscalPeriod.startDate.toLocaleDateString()} a ${fiscalPeriod.endDate.toLocaleDateString()}</p>`;
    
    html += '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial; font-size: 12px; border: 1px solid #ddd;">';
    html += '<tr style="background-color: #2c3e50; color: white;"><th>Número</th><th>Nome de Guerra</th><th>Turma</th><th>Total (R$)</th></tr>';
    
    let totalGeral = 0;

    Object.keys(groups).forEach(turma => {
      if (groups[turma].length > 0) {
        let totalTurma = 0;
        // Cabeçalho Turma
        html += `<tr style="background-color: #eee;"><td colspan="4"><strong>${turma}</strong></td></tr>`;
        
        groups[turma].forEach(r => {
          const valor = painel === 'CANTINA' ? r.totalCantina : r.totalCidade;
          if (valor > 0) {
             html += `<tr><td>${r.numero}</td><td>${r.guerra}</td><td>${turma}</td><td style="text-align: right">${valor.toFixed(2)}</td></tr>`;
             totalTurma += valor;
          }
        });
        
        if (totalTurma > 0) {
            // Total Turma
            html += `<tr><td colspan="3" style="text-align: right"><strong>Total ${turma}:</strong></td><td style="text-align: right"><strong>${totalTurma.toFixed(2)}</strong></td></tr>`;
            totalGeral += totalTurma;
        }
      }
    });

    html += `<tr style="background-color: #f39c12; color: white;"><td colspan="3" style="text-align: right"><strong>TOTAL GERAL:</strong></td><td style="text-align: right"><strong>${totalGeral.toFixed(2)}</strong></td></tr>`;
    html += '</table>';

    // --- RESUMO FINAL (TOTAIS POR ESQUADRÃO) ---
    html += '<br/><br/>';
    html += '<h3 style="font-family: Arial; color: #333;">Resumo Geral por Esquadrão</h3>';
    html += '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial; font-size: 12px; border: 1px solid #ddd;">';
    html += '<tr style="background-color: #2980b9; color: white;"><th>Esquadrão</th><th>Total Cantina (R$)</th><th>Total Cidade (R$)</th><th>Total Geral (R$)</th></tr>';

    let somaCantina = 0;
    let somaCidade = 0;
    let somaGeral = 0;

    Object.keys(groups).forEach(turma => {
        if (turma === 'Outros') return;
        
        const totalTurmaCantina = groups[turma].reduce((acc, r) => acc + r.totalCantina, 0);
        const totalTurmaCidade = groups[turma].reduce((acc, r) => acc + r.totalCidade, 0);
        const totalTurmaGeral = totalTurmaCantina + totalTurmaCidade;

        html += `<tr>
            <td><strong>${turma}</strong></td>
            <td style="text-align: right">${totalTurmaCantina.toFixed(2)}</td>
            <td style="text-align: right">${totalTurmaCidade.toFixed(2)}</td>
            <td style="text-align: right">${totalTurmaGeral.toFixed(2)}</td>
        </tr>`;

        somaCantina += totalTurmaCantina;
        somaCidade += totalTurmaCidade;
        somaGeral += totalTurmaGeral;
    });

    html += `<tr style="background-color: #f59e0b; color: white;">
        <td style="text-align: right"><strong>TOTAL ACUMULADO:</strong></td>
        <td style="text-align: right"><strong>${somaCantina.toFixed(2)}</strong></td>
        <td style="text-align: right"><strong>${somaCidade.toFixed(2)}</strong></td>
        <td style="text-align: right"><strong>${somaGeral.toFixed(2)}</strong></td>
    </tr>`;
    html += '</table></body></html>';
    
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${nomeArquivo}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  const handleExportAudit = async () => {
    // Busca TODOS os pedidos para filtrar localmente e gerar auditoria
    const allPedidos = await loginAPI.getPedidos();
    const pedidosPeriodo = allPedidos.filter(p => {
       const d = new Date(p.data);
       return d >= fiscalPeriod.startDate && d <= fiscalPeriod.endDate && p.status !== 'CANCELADO';
    });

    const wb = XLSX.utils.book_new();
    const wsData = [
      ["AUDITORIA DETALHADA DE PEDIDOS - CANTINA", `Referência: ${MESES[refMonth]}`],
      ["Data/Hora", "Cadete", "Guerra", "Itens", "Valor Total", "Status", "IP Origem", "Dispositivo (User Agent)"]
    ];

    pedidosPeriodo.forEach(p => {
      const itensStr = p.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ');
      const dataFormatada = new Date(p.data).toLocaleString();
      wsData.push([
        dataFormatada,
        p.usuarioNome,
        p.usuarioGuerra,
        itensStr,
        p.valorTotal.toFixed(2),
        p.status,
        p.ip || 'N/A',
        p.userAgent || 'N/A'
      ]);
    });

    // --- RESUMO FINAL (TOTAIS POR ESQUADRÃO) ---
    wsData.push([]);
    wsData.push([]);
    wsData.push(["------------------------------------------------------------"]);
    wsData.push(["RESUMO GERAL POR ESQUADRÃO"]);
    wsData.push(["Esquadrão", "Total Cantina (R$)", "Total Cidade (R$)", "Total Geral (R$)"]);

    const groups = getGroupedData();
    let somaCantina = 0;
    let somaCidade = 0;
    let somaGeral = 0;

    Object.keys(groups).forEach(turma => {
        if (turma === 'Outros') return; 
        
        const totalTurmaCantina = groups[turma].reduce((acc, r) => acc + r.totalCantina, 0);
        const totalTurmaCidade = groups[turma].reduce((acc, r) => acc + r.totalCidade, 0);
        const totalTurmaGeral = totalTurmaCantina + totalTurmaCidade;

        wsData.push([
            turma, 
            totalTurmaCantina.toFixed(2), 
            totalTurmaCidade.toFixed(2), 
            totalTurmaGeral.toFixed(2)
        ]);

        somaCantina += totalTurmaCantina;
        somaCidade += totalTurmaCidade;
        somaGeral += totalTurmaGeral;
    });

    wsData.push([
        "TOTAL ACUMULADO", 
        somaCantina.toFixed(2), 
        somaCidade.toFixed(2), 
        somaGeral.toFixed(2)
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria Completa");
    XLSX.writeFile(wb, `auditoria_cantina_${MESES[refMonth]}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const handleExportDailyReport = async (format: 'PDF' | 'XLSX') => {
    const allPedidos = await loginAPI.getPedidos(undefined, painel);
    const targetDate = new Date(dailyReportDate + 'T12:00:00').toDateString();
    
    // Filtra pedidos do dia selecionado, excluindo cancelados
    const pedidosDoDia = allPedidos.filter(p => 
      new Date(p.data).toDateString() === targetDate && 
      p.status !== StatusPedido.CANCELADO
    );

    const totalDoDia = pedidosDoDia.reduce((acc, p) => acc + p.valorTotal, 0);
    const dataFormatada = new Date(dailyReportDate + 'T12:00:00').toLocaleDateString();
    const titulo = `Relatório Diário - ${painel === 'CANTINA' ? 'Cantina' : 'Loja da Cidade'}`;

    if (format === 'XLSX') {
      const wb = XLSX.utils.book_new();
      const wsData: any[][] = [
        [titulo, `Data: ${dataFormatada}`],
        ["Total de Vendas", `R$ ${totalDoDia.toFixed(2)}`],
        ["Total de Pedidos", pedidosDoDia.length.toString()],
        [],
        ["Hora", "Cadete", "Esquadrão", "Itens", "Valor (R$)"]
      ];

      pedidosDoDia.forEach(p => {
        const cadete = relatorio.find(r => r.id === p.usuarioId);
        const esquadrao = getEsquadrao(cadete?.numero || '', cadete?.esquadrao);
        const itensStr = p.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ');
        wsData.push([
          new Date(p.data).toLocaleTimeString(),
          p.usuarioGuerra,
          esquadrao || '-',
          itensStr,
          p.valorTotal.toFixed(2)
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Relatório Diário");
      XLSX.writeFile(wb, `relatorio_diario_${painel.toLowerCase()}_${dailyReportDate}.xlsx`);
    } else {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(titulo, 14, 16);
      doc.setFontSize(10);
      doc.text(`Data: ${dataFormatada}`, 14, 24);
      doc.text(`Total de Vendas: R$ ${totalDoDia.toFixed(2)}`, 14, 30);
      doc.text(`Total de Pedidos: ${pedidosDoDia.length}`, 14, 36);

      const tableRows = pedidosDoDia.map(p => {
        const cadete = relatorio.find(r => r.id === p.usuarioId);
        const esquadrao = getEsquadrao(cadete?.numero || '', cadete?.esquadrao);
        const itensStr = p.itens.map(i => `${i.quantidade}x ${i.nome}`).join(', ');
        return [
          new Date(p.data).toLocaleTimeString(),
          p.usuarioGuerra,
          esquadrao || '-',
          itensStr,
          `R$ ${p.valorTotal.toFixed(2)}`
        ];
      });

      autoTable(doc, {
        head: [["Hora", "Cadete", "Esquadrão", "Itens", "Valor"]],
        body: tableRows,
        startY: 45,
      });

      doc.save(`relatorio_diario_${painel.toLowerCase()}_${dailyReportDate}.pdf`);
    }
    setIsDailyReportModalOpen(false);
    setIsExportMenuOpen(false);
  };

  const qtdSalgadadasPendentes = eventosSalgadada.filter(e => e.status === StatusPedido.PENDENTE).length;

  // --- Render ---
  return (
    <div className="space-y-8 relative">
      
      {/* Header com Abas Principais e Seletor de Painel */}
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-extrabold text-gray-800">
            {painel === 'CANTINA' ? 'Painel da Cantina' : 'Painel da Cidade'}
          </h2>
          
          {/* Toggle de Painel */}
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setPainel('CANTINA')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${painel === 'CANTINA' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Cantina
            </button>
            <button
              onClick={() => setPainel('CIDADE')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${painel === 'CIDADE' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Loja da Cidade
            </button>
          </div>
        </div>

        <div className="flex p-1 bg-white rounded-xl border border-gray-200 shadow-sm w-full md:w-auto overflow-x-auto">
          <button 
            onClick={() => setTab('FILA')}
            className={`flex-1 md:w-40 py-2 text-sm font-bold rounded-lg transition-all ${tab === 'FILA' ? (painel === 'CANTINA' ? 'bg-gray-900' : 'bg-blue-900') + ' text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Fila de Pedidos
          </button>
          <button 
            onClick={() => setTab('RELATORIO')}
            className={`flex-1 md:w-40 py-2 text-sm font-bold rounded-lg transition-all ${tab === 'RELATORIO' ? (painel === 'CANTINA' ? 'bg-gray-900' : 'bg-blue-900') + ' text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Relatório Geral
          </button>
          {painel === 'CANTINA' && (
            <button 
              onClick={() => setTab('SALGADADAS')}
              className={`relative flex-1 md:w-40 py-2 text-sm font-bold rounded-lg transition-all ${tab === 'SALGADADAS' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Salgadadas
              {qtdSalgadadasPendentes > 0 && (
                <span className="absolute top-1 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white animate-pulse">
                  {qtdSalgadadasPendentes}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {tab === 'FILA' && (
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
                           {pedidosTurma.map(p => {
                             const cadete = relatorio.find(r => r.id === p.usuarioId);
                             const esquadrao = getEsquadrao(cadete?.numero || '');
                             
                             return (
                               <GlassCard key={p.id} className="p-6 border-l-[6px] border-l-brand-500 shadow-sm hover:shadow-md transition-all">
                                 <div className="flex justify-between items-start mb-4">
                                   <div>
                                     <div className="flex items-center gap-2">
                                       <h4 className="font-extrabold text-xl text-gray-900">{p.usuarioGuerra}</h4>
                                       <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded font-bold uppercase">{esquadrao || turma}</span>
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
                             );
                           })}
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
      )}

      {tab === 'RELATORIO' && (
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
                 <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fade-in">
                   <div className="p-2 space-y-1">
                      <button onClick={handleExportXLSX} className="w-full text-left px-4 py-3 hover:bg-green-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                         <span className="text-green-600 text-lg">📊</span> Excel (Painel Atual)
                      </button>
                      <button onClick={handleExportSeparatedXLSX} className="w-full text-left px-4 py-3 hover:bg-green-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                         <span className="text-green-800 text-lg">📑</span> Excel (Separado)
                      </button>
                      <button onClick={handleExportUnifiedPDF} className="w-full text-left px-4 py-3 hover:bg-red-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                         <span className="text-red-700 text-lg">📄</span> PDF (Relatório Completo)
                      </button>
                      <button onClick={handleExportDOCX} className="w-full text-left px-4 py-3 hover:bg-blue-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                         <span className="text-blue-600 text-lg">📝</span> Word (Resumo)
                      </button>
                      <div className="h-px bg-gray-100 my-1"></div>
                      <button onClick={() => { setIsExportMenuOpen(false); setIsDailyReportModalOpen(true); }} className="w-full text-left px-4 py-3 hover:bg-orange-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                         <span className="text-orange-500 text-lg">📅</span> Relatório Diário
                      </button>
                      <div className="h-px bg-gray-100 my-1"></div>
                      <button onClick={handleExportAudit} className="w-full text-left px-4 py-3 hover:bg-purple-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                          <span className="text-purple-600 text-lg">🕵️</span> Auditoria Completa (IP/Log)
                      </button>
                   </div>
                 </div>
               )}
            </div>
          </div>

          {/* Overlay para fechar dropdown */}
          {isExportMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setIsExportMenuOpen(false)}></div>}

          {/* Modal de Relatório Diário */}
          {isDailyReportModalOpen && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
              <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-gray-900">Relatório Diário</h3>
                  <button onClick={() => setIsDailyReportModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Selecione o Dia</label>
                    <input 
                      type="date" 
                      value={dailyReportDate}
                      onChange={(e) => setDailyReportDate(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-xl focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => handleExportDailyReport('XLSX')}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-600/20 transition-all"
                    >
                      Baixar Excel
                    </button>
                    <button 
                      onClick={() => handleExportDailyReport('PDF')}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-red-600/20 transition-all"
                    >
                      Baixar PDF
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

          {loadingRelatorio && <div className="p-12 text-center text-gray-400 font-bold">Carregando relatório...</div>}

          {!loadingRelatorio && orderedGroups.map(turma => {
            const cadetesTurma = groupedRelatorio[turma];
            if (cadetesTurma.length === 0) return null;
            
            const totalTurma = cadetesTurma.reduce((acc, c) => {
              const valor = painel === 'CANTINA' ? (c.totalCantina || 0) : (c.totalCidade || 0);
              return acc + valor;
            }, 0);

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
                          <th className="p-5 font-bold">Nome de Guerra</th>
                          <th className="p-5 font-bold text-center">Quantidade de Pedidos</th>
                          <th className="p-5 font-bold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {cadetesTurma.map(r => {
                          const valor = painel === 'CANTINA' ? (r.totalCantina || 0) : (r.totalCidade || 0);
                          return (
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
                              <td className="p-5 text-right font-mono text-gray-900 font-bold text-base">R$ {valor.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'SALGADADAS' && (
        <div className="space-y-6 animate-fade-in pb-20">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-xl font-bold text-gray-800">Eventos de Salgadada</h2>
            <button 
              onClick={() => {
                setLoadingSalgadadas(true);
                loginAPI.getEventosSalgadada().then(data => {
                  setEventosSalgadada(data);
                  setLoadingSalgadadas(false);
                });
              }}
              className="text-sm text-brand-600 hover:text-brand-800 font-bold flex items-center gap-1"
            >
              <Icons.Refresh className={`w-4 h-4 ${loadingSalgadadas ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
          
          {loadingSalgadadas ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white/50 h-64 rounded-2xl animate-pulse border border-gray-100"></div>
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              {orderedGroups.map(turma => {
                // Filtra eventos por turma do responsável
                const eventosTurma = eventosSalgadada.filter(evento => {
                   const esquadraoResp = getEsquadrao(evento.responsavelNumero || '');
                   // Se não tiver número, cai em 'Outros'. Se tiver, compara com a turma atual.
                   if (!esquadraoResp) return turma === 'Outros';
                   // getEsquadrao retorna "Xº Esquadrão". turma é "Xº Ano".
                   // Vamos normalizar para comparar apenas o número.
                   const numEsquadrao = esquadraoResp.charAt(0);
                   const numTurma = turma.charAt(0);
                   return numEsquadrao === numTurma;
                });

                if (eventosTurma.length === 0) return null;

                return (
                  <div key={turma}>
                    <h3 className="text-gray-500 font-bold uppercase text-xs tracking-wider mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand-500"></span>
                      {turma} ({eventosTurma.length})
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                      {eventosTurma.map(evento => {
                        const esquadraoResp = getEsquadrao(evento.responsavelNumero || '');
                        return (
                          <GlassCard key={evento.id} className="p-6 border-l-[6px] border-l-brand-500 shadow-sm hover:shadow-md transition-all">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-extrabold text-xl text-gray-900">{evento.nome}</h3>
                                  <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                                    {esquadraoResp || turma}
                                  </span>
                                </div>
                                <div className="flex flex-col mt-1">
                                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Resp: {evento.responsavelNome}
                                  </span>
                                  <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1 mt-0.5">
                                    <Icons.Clock className="w-3 h-3" />
                                    {new Date(evento.data).toLocaleDateString()} • {new Date(evento.data).toLocaleTimeString().slice(0,5)}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="block font-extrabold text-lg text-brand-600">
                                  R$ {evento.valorTotal.toFixed(2)}
                                </span>
                                <span className="text-xs text-gray-500 font-medium bg-brand-50 px-2 py-1 rounded-full inline-block mt-1">
                                  {evento.participantesIds.length} Participantes
                                </span>
                              </div>
                            </div>

                            <div className="bg-brand-50/50 p-4 rounded-xl mb-4 border border-brand-100/50">
                              <p className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1">
                                <Icons.ShoppingBag className="w-3 h-3" /> Itens do Evento
                              </p>
                              <div className="space-y-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                                {evento.itens.map((item: any, idx: number) => (
                                  <div key={idx} className="flex justify-between text-sm text-gray-700 border-b border-gray-100 last:border-0 pb-1 last:pb-0">
                                    <span className="font-medium">{item.quantidade}x {item.nome}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {evento.observacoes && (
                              <div className="text-xs text-gray-600 italic bg-yellow-50 p-3 rounded-lg border border-yellow-100 flex gap-2 items-start mb-4">
                                <span className="text-yellow-500 mt-0.5">⚠️</span>
                                <span>{evento.observacoes}</span>
                              </div>
                            )}

                            <div className="flex gap-3 pt-2">
                              {evento.status !== StatusPedido.CONCLUIDO && evento.status !== StatusPedido.CANCELADO ? (
                                <>
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      console.log('CLICK ENTREGAR DETECTADO');
                                      handleStatusSalgadada(evento.id, StatusPedido.CONCLUIDO);
                                    }}
                                    style={{ position: 'relative', zIndex: 50, cursor: 'pointer' }}
                                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                                  >
                                    <Icons.Check className="w-4 h-4" /> Entregar
                                  </button>
                                  
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      console.log('CLICK CANCELAR DETECTADO');
                                      handleStatusSalgadada(evento.id, StatusPedido.CANCELADO);
                                    }}
                                    style={{ position: 'relative', zIndex: 50, cursor: 'pointer' }}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-lg shadow-red-600/30 border border-transparent text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                                  >
                                    <Icons.X className="w-4 h-4" /> Cancelar
                                  </button>
                                </>
                              ) : (
                                <div className={`w-full text-center p-2 rounded-lg font-bold border flex items-center justify-center gap-2 ${
                                  evento.status === StatusPedido.CONCLUIDO 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                    : 'bg-red-50 text-red-700 border-red-100'
                                }`}>
                                  {evento.status === StatusPedido.CONCLUIDO ? (
                                    <><span>🎉</span> Entregue / Concluído</>
                                  ) : (
                                    <><span>🚫</span> Cancelado</>
                                  )}
                                </div>
                              )}
                            </div>
                          </GlassCard>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              
              {eventosSalgadada.length === 0 && (
                 <div className="text-center py-16 bg-white/50 rounded-3xl border border-dashed border-gray-200">
                   <div className="text-5xl mb-4">🎉</div>
                   <p className="text-gray-400 font-bold">Nenhum evento de salgadada ativo.</p>
                 </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- MODAL DE DETALHES --- */}
      {selectedCadet && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in" onClick={closeDetails}>
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
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
        </div>,
        document.body
      )}

    </div>
  );
};
