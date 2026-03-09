import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { loginAPI } from '../services/loginAPI';
import { GlassCard, GlassButton, StatusBadge } from '../components/GlassUI';
import { Pedido, StatusPedido } from '../types';
import { getEsquadrao } from '../utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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

export const DiretoriaPage: React.FC = () => {
  const [tab, setTab] = useState<'RESUMO' | 'DETALHADO' | 'CEDULA'>('RESUMO');
  const [relatorio, setRelatorio] = useState<RelatorioCadete[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados para Cédula/Salgadada
  const [eventos, setEventos] = useState<any[]>([]);
  const [cadetes, setCadetes] = useState<any[]>([]); // Usando any para simplificar, idealmente Usuario
  const [editingEvento, setEditingEvento] = useState<any | null>(null);

  // Filtros de Data (Mês Fiscal)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const hoje = new Date();
    const dia = hoje.getDate();
    const mes = hoje.getMonth();
    // Se dia >= 20, o mês de referência é 2 meses à frente (ex: 20/Fev -> Abril)
    // Se dia < 20, o mês de referência é 1 mês à frente (ex: 10/Mar -> Abril)
    const target = dia >= 20 ? mes + 2 : mes + 1;
    return target % 12;
  });
  // Ano sempre atual

  // Estados para o Modal de Detalhes
  const [selectedCadet, setSelectedCadet] = useState<RelatorioCadete | null>(null);
  const [historicoDetalhado, setHistoricoDetalhado] = useState<Pedido[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Relatório Diário
  const [isDailyReportModalOpen, setIsDailyReportModalOpen] = useState(false);
  const [dailyReportDate, setDailyReportDate] = useState(new Date().toISOString().split('T')[0]);

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
    loginAPI.getRelatorioFinanceiro(fiscalPeriod.startDate, fiscalPeriod.endDate).then(data => {
      setRelatorio(data);
      setLoading(false);
    });

    // Carrega dados para a aba Cédula
    loginAPI.getEventosSalgadada().then(setEventos);
    loginAPI.getCadetes().then(setCadetes);
  }, [fiscalPeriod]);

  const handleSaveParticipantes = async () => {
    if (!editingEvento) return;
    await loginAPI.updateParticipantesEvento(editingEvento.id, editingEvento.participantesIds);
    alert('Participantes atualizados com sucesso!');
    setEditingEvento(null);
    loginAPI.getEventosSalgadada().then(setEventos);
  };

  const toggleParticipanteEdicao = (id: string) => {
    if (!editingEvento) return;
    const current = editingEvento.participantesIds;
    const updated = current.includes(id)
      ? current.filter((p: string) => p !== id)
      : [...current, id];
    setEditingEvento({ ...editingEvento, participantesIds: updated });
  };

  // Lógica de Agrupamento por Turma (Reutilizada para exportação)
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

  // --- Funções de Exportação ---

  const handleExportAudit = async () => {
    // Busca TODOS os pedidos para filtrar localmente e gerar auditoria
    const allPedidos = await loginAPI.getPedidos();
    const pedidosPeriodo = allPedidos.filter(p => {
      const d = new Date(p.data);
      return d >= fiscalPeriod.startDate && d <= fiscalPeriod.endDate && p.status !== 'CANCELADO';
    });

    const wb = XLSX.utils.book_new();
    const wsData = [
      ["AUDITORIA DETALHADA DE PEDIDOS", `Referência: ${MESES[selectedMonth]}`],
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

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria Completa");
    XLSX.writeFile(wb, `auditoria_detalhada_${MESES[selectedMonth]}.xlsx`);
    setIsExportMenuOpen(false);
  };

  // Função para abrir o modal e carregar histórico
  const handleCadetClick = async (cadete: RelatorioCadete) => {
    setSelectedCadet(cadete);
    setLoadingHistorico(true);
    // Busca os pedidos filtrados pelo ID do usuário
    const pedidos = await loginAPI.getPedidos(cadete.id);

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

  // Cálculo do Resumo por Esquadrão para Exibição e Exportação
  const resumoPorEsquadrao = useMemo(() => {
    const dados = orderedKeys.map(turma => {
      if (turma === 'Outros') return null;
      const cadetes = groupedData[turma];
      const totalCantina = cadetes.reduce((acc, c) => acc + (c.totalCantina || 0), 0);
      const totalCidade = cadetes.reduce((acc, c) => acc + (c.totalCidade || 0), 0);
      const totalGeral = totalCantina + totalCidade;
      return { turma, totalCantina, totalCidade, totalGeral };
    }).filter(Boolean) as { turma: string, totalCantina: number, totalCidade: number, totalGeral: number }[];

    const acumulado = dados.reduce((acc, r) => ({
        totalCantina: acc.totalCantina + r.totalCantina,
        totalCidade: acc.totalCidade + r.totalCidade,
        totalGeral: acc.totalGeral + r.totalGeral
    }), { totalCantina: 0, totalCidade: 0, totalGeral: 0 });

    return { dados, acumulado };
  }, [groupedData, orderedKeys]);

  // --- Funções de Exportação Atualizadas ---

  const handleExportXLSX = () => {
    const currentYear = new Date().getFullYear();
    const groups = getGroupedData();
    const wb = XLSX.utils.book_new();

    // Aba Geral
    const wsData = [
      ["Relatório Financeiro - Diretoria", `Referência: ${MESES[selectedMonth]}/${currentYear}`],
      ["Período", `${fiscalPeriod.startDate.toLocaleDateString()} a ${fiscalPeriod.endDate.toLocaleDateString()}`],
      [],
      ["Número", "Nome de Guerra", "Nome Completo", "Turma", "Quantidade de Pedidos", "Cantina (R$)", "Cidade (R$)", "Total Gasto (R$)"]
    ];

    let totalGeral = 0;
    let totalGeralCantina = 0;
    let totalGeralCidade = 0;

    Object.keys(groups).forEach(turma => {
      if (groups[turma].length > 0) {
        let totalTurma = 0;
        let totalTurmaCantina = 0;
        let totalTurmaCidade = 0;

        groups[turma].forEach(r => {
          wsData.push([
            r.numero,
            r.guerra,
            r.nome,
            turma,
            r.qtdPedidos.toString(),
            (r.totalCantina || 0).toFixed(2),
            (r.totalCidade || 0).toFixed(2),
            r.totalGasto.toFixed(2)
          ]);
          totalTurma += r.totalGasto;
          totalTurmaCantina += (r.totalCantina || 0);
          totalTurmaCidade += (r.totalCidade || 0);
        });
        // Linha de Total da Turma
        wsData.push(["", "", `TOTAL ${turma.toUpperCase()}`, "", "", totalTurmaCantina.toFixed(2), totalTurmaCidade.toFixed(2), totalTurma.toFixed(2)]);
        wsData.push([]); // Espaço
        totalGeral += totalTurma;
        totalGeralCantina += totalTurmaCantina;
        totalGeralCidade += totalTurmaCidade;
      }
    });

    wsData.push(["", "", "TOTAL GERAL", "", "", totalGeralCantina.toFixed(2), totalGeralCidade.toFixed(2), totalGeral.toFixed(2)]);

    // --- RESUMO FINAL (TOTAIS POR ESQUADRÃO) ---
    wsData.push([]);
    wsData.push([]);
    wsData.push(["------------------------------------------------------------"]);
    wsData.push(["RESUMO GERAL POR ESQUADRÃO"]);
    wsData.push(["Esquadrão", "Total Cantina (R$)", "Total Cidade (R$)", "Total Geral (R$)"]);

    resumoPorEsquadrao.dados.forEach(r => {
        wsData.push([
            r.turma,
            r.totalCantina.toFixed(2),
            r.totalCidade.toFixed(2),
            r.totalGeral.toFixed(2)
        ]);
    });

    wsData.push([
        "TOTAL ACUMULADO",
        resumoPorEsquadrao.acumulado.totalCantina.toFixed(2),
        resumoPorEsquadrao.acumulado.totalCidade.toFixed(2),
        resumoPorEsquadrao.acumulado.totalGeral.toFixed(2)
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Resumo Financeiro");
    XLSX.writeFile(wb, `diretoria_financeiro_${MESES[selectedMonth]}_${currentYear}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const handleExportPDF = () => {
    const currentYear = new Date().getFullYear();
    const doc = new jsPDF();
    const groups = getGroupedData();

    doc.setFontSize(16);
    doc.text(`Relatório Diretoria - ${MESES[selectedMonth]}/${currentYear}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Período: ${fiscalPeriod.startDate.toLocaleDateString()} a ${fiscalPeriod.endDate.toLocaleDateString()}`, 14, 24);

    const tableRows: any[] = [];
    let totalGeral = 0;
    let totalGeralCantina = 0;
    let totalGeralCidade = 0;

    Object.keys(groups).forEach(turma => {
      if (groups[turma].length > 0) {
        // Cabeçalho da Turma
        tableRows.push([{ content: turma.toUpperCase(), colSpan: 6, styles: { fillColor: [220, 220, 220], fontStyle: 'bold' } }]);

        let totalTurma = 0;
        let totalTurmaCantina = 0;
        let totalTurmaCidade = 0;

        groups[turma].forEach(r => {
          tableRows.push([
            r.numero,
            r.guerra,
            r.qtdPedidos,
            `R$ ${(r.totalCantina || 0).toFixed(2)}`,
            `R$ ${(r.totalCidade || 0).toFixed(2)}`,
            `R$ ${r.totalGasto.toFixed(2)}`
          ]);
          totalTurma += r.totalGasto;
          totalTurmaCantina += (r.totalCantina || 0);
          totalTurmaCidade += (r.totalCidade || 0);
        });

        // Total da Turma
        tableRows.push([{ content: `Total ${turma}: R$ ${totalTurma.toFixed(2)}`, colSpan: 6, styles: { fontStyle: 'bold', halign: 'right' } }]);
        totalGeral += totalTurma;
        totalGeralCantina += totalTurmaCantina;
        totalGeralCidade += totalTurmaCidade;
      }
    });

    // Total Geral
    tableRows.push([{ content: `TOTAL GERAL: R$ ${totalGeral.toFixed(2)}`, colSpan: 6, styles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'right' } }]);

    autoTable(doc, {
      head: [["Número", "Nome de Guerra", "Qtd", "Cantina", "Cidade", "Total"]],
      body: tableRows,
      startY: 30,
    });

    // --- RESUMO FINAL (TOTAIS POR ESQUADRÃO) ---
    doc.addPage();
    doc.setFontSize(14);
    doc.text("Resumo Geral por Esquadrão", 14, 20);

    const summaryRows = resumoPorEsquadrao.dados.map(r => [
        r.turma,
        `R$ ${r.totalCantina.toFixed(2)}`,
        `R$ ${r.totalCidade.toFixed(2)}`,
        `R$ ${r.totalGeral.toFixed(2)}`
    ]);

    summaryRows.push([
        { content: "TOTAL ACUMULADO", styles: { fontStyle: 'bold' } },
        { content: `R$ ${resumoPorEsquadrao.acumulado.totalCantina.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        { content: `R$ ${resumoPorEsquadrao.acumulado.totalCidade.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        { content: `R$ ${resumoPorEsquadrao.acumulado.totalGeral.toFixed(2)}`, styles: { fontStyle: 'bold', fillColor: [245, 158, 11], textColor: 255 } }
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

    doc.save(`diretoria_relatorio_${MESES[selectedMonth]}.pdf`);
    setIsExportMenuOpen(false);
  };

  const handleExportDOCX = () => {
    const currentYear = new Date().getFullYear();
    const groups = getGroupedData();

    let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Relatório</title></head><body>`;
    html += `<h2 style="font-family: Arial">Relatório Diretoria - ${MESES[selectedMonth]}/${currentYear}</h2>`;
    html += `<p style="font-family: Arial">Período: ${fiscalPeriod.startDate.toLocaleDateString()} a ${fiscalPeriod.endDate.toLocaleDateString()}</p>`;

    html += '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial; font-size: 12px; border: 1px solid #ddd;">';
    html += '<tr style="background-color: #2c3e50; color: white;"><th>Número</th><th>Nome de Guerra</th><th>Turma</th><th>Cantina (R$)</th><th>Cidade (R$)</th><th>Total (R$)</th></tr>';

    let totalGeral = 0;
    let totalGeralCantina = 0;
    let totalGeralCidade = 0;

    Object.keys(groups).forEach(turma => {
      if (groups[turma].length > 0) {
        let totalTurma = 0;
        let totalTurmaCantina = 0;
        let totalTurmaCidade = 0;

        // Cabeçalho Turma
        html += `<tr style="background-color: #eee;"><td colspan="6"><strong>${turma}</strong></td></tr>`;

        groups[turma].forEach(r => {
          html += `<tr>
            <td>${r.numero}</td>
            <td>${r.guerra}</td>
            <td>${turma}</td>
            <td style="text-align: right">${(r.totalCantina || 0).toFixed(2)}</td>
            <td style="text-align: right">${(r.totalCidade || 0).toFixed(2)}</td>
            <td style="text-align: right">${r.totalGasto.toFixed(2)}</td>
          </tr>`;
          totalTurma += r.totalGasto;
          totalTurmaCantina += (r.totalCantina || 0);
          totalTurmaCidade += (r.totalCidade || 0);
        });

        // Total Turma
        html += `<tr><td colspan="5" style="text-align: right"><strong>Total ${turma}:</strong></td><td style="text-align: right"><strong>${totalTurma.toFixed(2)}</strong></td></tr>`;
        totalGeral += totalTurma;
        totalGeralCantina += totalTurmaCantina;
        totalGeralCidade += totalTurmaCidade;
      }
    });

    html += `<tr style="background-color: #f39c12; color: white;"><td colspan="5" style="text-align: right"><strong>TOTAL GERAL:</strong></td><td style="text-align: right"><strong>${totalGeral.toFixed(2)}</strong></td></tr>`;
    html += '</table>';

    // --- RESUMO FINAL (TOTAIS POR ESQUADRÃO) ---
    html += '<br/><br/>';
    html += '<h3 style="font-family: Arial; color: #333;">Resumo Geral por Esquadrão</h3>';
    html += '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial; font-size: 12px; border: 1px solid #ddd;">';
    html += '<tr style="background-color: #2980b9; color: white;"><th>Esquadrão</th><th>Total Cantina (R$)</th><th>Total Cidade (R$)</th><th>Total Geral (R$)</th></tr>';

    resumoPorEsquadrao.dados.forEach(r => {
        html += `<tr>
            <td><strong>${r.turma}</strong></td>
            <td style="text-align: right">${r.totalCantina.toFixed(2)}</td>
            <td style="text-align: right">${r.totalCidade.toFixed(2)}</td>
            <td style="text-align: right">${r.totalGeral.toFixed(2)}</td>
        </tr>`;
    });

    html += `<tr style="background-color: #f59e0b; color: white;">
        <td style="text-align: right"><strong>TOTAL ACUMULADO:</strong></td>
        <td style="text-align: right"><strong>${resumoPorEsquadrao.acumulado.totalCantina.toFixed(2)}</strong></td>
        <td style="text-align: right"><strong>${resumoPorEsquadrao.acumulado.totalCidade.toFixed(2)}</strong></td>
        <td style="text-align: right"><strong>${resumoPorEsquadrao.acumulado.totalGeral.toFixed(2)}</strong></td>
    </tr>`;
    html += '</table></body></html>';

    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diretoria_relatorio_${MESES[selectedMonth]}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  const handleExportDailyReport = async (format: 'PDF' | 'XLSX') => {
    const allPedidos = await loginAPI.getPedidos();
    const targetDate = new Date(dailyReportDate + 'T12:00:00').toDateString();
    
    // Filtra pedidos do dia selecionado, excluindo cancelados
    const pedidosDoDia = allPedidos.filter(p => 
      new Date(p.data).toDateString() === targetDate && 
      p.status !== StatusPedido.CANCELADO
    );

    const totalDoDia = pedidosDoDia.reduce((acc, p) => acc + p.valorTotal, 0);
    const dataFormatada = new Date(dailyReportDate + 'T12:00:00').toLocaleDateString();
    const titulo = `Relatório Diário - Diretoria`;

    if (format === 'XLSX') {
      const wb = XLSX.utils.book_new();
      const wsData: any[][] = [
        [titulo, `Data: ${dataFormatada}`],
        ["Total de Vendas", `R$ ${totalDoDia.toFixed(2)}`],
        ["Total de Pedidos", pedidosDoDia.length.toString()],
        [],
        ["Hora", "Cadete", "Esquadrão", "Itens", "Valor (R$)", "Origem"]
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
          p.valorTotal.toFixed(2),
          p.origem || 'CANTINA'
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Relatório Diário");
      XLSX.writeFile(wb, `relatorio_diario_diretoria_${dailyReportDate}.xlsx`);
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
          `R$ ${p.valorTotal.toFixed(2)}`,
          p.origem || 'CANTINA'
        ];
      });

      autoTable(doc, {
        head: [["Hora", "Cadete", "Esquadrão", "Itens", "Valor", "Origem"]],
        body: tableRows,
        startY: 45,
      });

      doc.save(`relatorio_diario_diretoria_${dailyReportDate}.pdf`);
    }
    setIsDailyReportModalOpen(false);
    setIsExportMenuOpen(false);
  };

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
          <div className="flex p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setTab('RESUMO')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'RESUMO' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              RESUMO
            </button>
            <button
              onClick={() => setTab('CEDULA')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'CEDULA' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Salgadadas
            </button>
          </div>

          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Montante Total ({MESES[selectedMonth]})</span>
            <span className="text-3xl font-extrabold text-brand-600">R$ {totalGeral.toFixed(2)}</span>
            <p className="text-[10px] text-gray-400 mt-1">
              {fiscalPeriod.startDate.toLocaleDateString()} até {fiscalPeriod.endDate.toLocaleDateString()}
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="w-full md:w-auto bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exportar Relatórios
            </button>

            {/* Dropdown Menu */}
            {isExportMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsExportMenuOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fade-in origin-top-right">
                  <div className="p-2 space-y-1">
                    <button onClick={handleExportXLSX} className="w-full text-left px-4 py-3 hover:bg-green-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                      <span className="text-green-600 text-lg">📊</span> Excel (Resumo)
                    </button>
                    <button onClick={handleExportPDF} className="w-full text-left px-4 py-3 hover:bg-red-50 text-gray-700 rounded-lg font-medium flex items-center gap-3">
                      <span className="text-red-500 text-lg">📄</span> PDF (Resumo)
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
              </>
            )}
          </div>
        </div>
      </div>

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

      {loading && <div className="p-12 text-center text-gray-400 font-bold">Carregando dados financeiros...</div>}

      {tab === 'CEDULA' && !loading && (
        <div className="space-y-6 animate-fade-in pb-20">
          <h2 className="text-xl font-bold text-gray-800 px-2">Gerenciar Salgadadas</h2>

          {editingEvento ? (
            <GlassCard className="!p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">Editando: {editingEvento.nome}</h3>
                <button onClick={() => setEditingEvento(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Selecione os participantes para recalcular o rateio.</p>
                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-xl p-2 grid grid-cols-2 md:grid-cols-3 gap-2 bg-white/50">
                  {cadetes.map(cadete => (
                    <button
                      key={cadete.id}
                      onClick={() => toggleParticipanteEdicao(cadete.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg text-left transition-all ${editingEvento.participantesIds.includes(cadete.id)
                          ? 'bg-brand-100 border-brand-300 text-brand-900 ring-1 ring-brand-300'
                          : 'hover:bg-gray-100 text-gray-600 border border-transparent'
                        }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${editingEvento.participantesIds.includes(cadete.id) ? 'bg-brand-500 border-brand-500' : 'border-gray-300 bg-white'}`}>
                        {editingEvento.participantesIds.includes(cadete.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-xs font-bold truncate">{cadete.nomeDeGuerra}</span>
                        <span className="text-[9px] text-gray-400 truncate font-medium">
                          {getEsquadrao(cadete.numero, cadete.esquadrao)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl mb-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Total Evento</p>
                  <p className="font-bold text-lg">R$ {editingEvento.valorTotal.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase font-bold">Novo Rateio ({editingEvento.participantesIds.length})</p>
                  <p className="font-bold text-xl text-brand-600">
                    R$ {(editingEvento.participantesIds.length > 0 ? editingEvento.valorTotal / editingEvento.participantesIds.length : 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <button
                onClick={handleSaveParticipantes}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg transition-all"
              >
                Salvar Alterações
              </button>
            </GlassCard>
          ) : (
            <div className="space-y-4">
              {eventos.map(evento => (
                <GlassCard key={evento.id} className="!p-5 flex justify-between items-center hover:shadow-lg transition-all">
                  <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      {evento.nome}
                      {evento.status === StatusPedido.CONCLUIDO ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">Concluído</span>
                      ) : (
                        <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full border border-yellow-200">Pendente</span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Resp: {evento.responsavelNome} • {new Date(evento.data).toLocaleDateString()}
                    </p>
                    <p className="text-sm font-medium text-gray-700 mt-2">
                      {evento.participantesIds.length} Participantes • Total: R$ {evento.valorTotal.toFixed(2)}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingEvento(evento)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-sm transition-colors"
                  >
                    Editar participantes
                  </button>
                </GlassCard>
              ))}
              {eventos.length === 0 && (
                <p className="text-center text-gray-400 py-10">Nenhum evento de salgadada encontrado.</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'RESUMO' && !loading && (
        <>
          {/* Tabela de Resumo Geral por Esquadrão */}
          <div className="mb-10 animate-fade-in">
            <h3 className="text-lg font-bold text-gray-800 mb-4 px-2 border-l-4 border-brand-600 pl-3">
              Resumo Geral por Esquadrão
            </h3>
            <GlassCard className="overflow-hidden p-0 border border-gray-200 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="p-4 font-bold">Esquadrão</th>
                      <th className="p-4 font-bold text-right text-gray-400">Total Cantina</th>
                      <th className="p-4 font-bold text-right text-blue-400">Total Cidade</th>
                      <th className="p-4 font-bold text-right text-gray-800">Total Geral</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resumoPorEsquadrao.dados.map((r, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors text-sm">
                        <td className="p-4 font-bold text-gray-700">{r.turma}</td>
                        <td className="p-4 text-right font-mono text-gray-500 font-medium">R$ {r.totalCantina.toFixed(2)}</td>
                        <td className="p-4 text-right font-mono text-blue-500 font-medium">R$ {r.totalCidade.toFixed(2)}</td>
                        <td className="p-4 text-right font-mono text-gray-900 font-bold">R$ {r.totalGeral.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="bg-brand-50 border-t-2 border-brand-100">
                      <td className="p-4 font-extrabold text-brand-800 uppercase text-xs tracking-wider">Total Acumulado</td>
                      <td className="p-4 text-right font-mono text-brand-700 font-bold">R$ {resumoPorEsquadrao.acumulado.totalCantina.toFixed(2)}</td>
                      <td className="p-4 text-right font-mono text-brand-700 font-bold">R$ {resumoPorEsquadrao.acumulado.totalCidade.toFixed(2)}</td>
                      <td className="p-4 text-right font-mono text-brand-900 font-extrabold text-lg">R$ {resumoPorEsquadrao.acumulado.totalGeral.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>

          {orderedKeys.map(turma => {
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
                          <th className="p-5 font-bold text-center">Qtd</th>
                          <th className="p-5 font-bold text-right text-gray-400">Cantina</th>
                          <th className="p-5 font-bold text-right text-blue-400">Cidade</th>
                          <th className="p-5 font-bold text-right">Total</th>
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
                            <td className="p-5 text-right font-mono text-gray-400 font-medium">
                              R$ {(r.totalCantina || 0).toFixed(2)}
                            </td>
                            <td className="p-5 text-right font-mono text-blue-500 font-medium">
                              R$ {(r.totalCidade || 0).toFixed(2)}
                            </td>
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
        </>
      )}

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