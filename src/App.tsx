import { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Tipos
type InvestmentType = 'fund' | 'cdb' | 'lci' | 'poupanca' | 'comparison';

interface SimulationParams {
  principal: number;
  months: number;
  cdiAnnual: number;
  ipcaAnnual: number;
  fundName: string;
  fundRateMonthly: number;
  cdbPercentOfCDI: number;
  lciPercentOfCDI: number;
  preFixedAnnual: number;
  ipcaPlusAnnual: number;
  comparisonFund12MonthReturn: number;
  globalPayoutMonthly: boolean;
}

interface MonthlyDetail {
  month: number;
  principal: number;
  grossProfit: number;
  taxRate: number;
  taxAmount: number;
  netProfit: number;
  accumulated: number;
}

interface SimulationResult {
  type: InvestmentType;
  name: string;
  grossTotal: number;
  taxAmount: number;
  taxRate: number;
  netTotal: number;
  netReturnPercent: number;
  monthlyReturnPercentOfCDI: number;
  monthlyPayoutGross: number;
  monthlyPayoutNet: number;
  monthlyRateGross: number;
  monthlyRateNet: number;
  annualRateGross: number;
  annualRateNet: number;
  grossUp: number;
  isUserFund: boolean;
  monthlyDetails: MonthlyDetail[];
  evolutionData: { month: number; value: number }[];
}

// Funções de cálculo
const annualToMonthlyCompound = (annualRate: number) => Math.pow(1 + annualRate / 100, 1 / 12) - 1;
const monthlyToAnnualCompound = (monthlyRate: number) => (Math.pow(1 + monthlyRate, 12) - 1) * 100;
const monthlyToAnnualSimple = (monthlyRate: number) => monthlyRate * 12 * 100;

const getTaxRate = (days: number): number => {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.20;
  if (days <= 720) return 0.175;
  return 0.15;
};

const calculateSimulations = (params: SimulationParams): SimulationResult[] => {
  const { principal, months, cdiAnnual, ipcaAnnual, fundName, fundRateMonthly, cdbPercentOfCDI, lciPercentOfCDI, preFixedAnnual, ipcaPlusAnnual, comparisonFund12MonthReturn, globalPayoutMonthly } = params;

  const cdiMonthly = annualToMonthlyCompound(cdiAnnual);
  const days = months * 30;
  const periodTaxRate = getTaxRate(days);

  const results: SimulationResult[] = [];

  const calculatePercentOfCDI = (annualRateGross: number): number => {
    if (cdiAnnual === 0) return 0;
    // Padrão de mercado: comparar taxas anuais brutas
    return (annualRateGross / cdiAnnual) * 100;
  };

  const calculateGrossUp = (exemptPercentOfCDI: number): number => {
    // Fórmula padrão de mercado (Linear)
    // GrossUp = TaxaLCI / (1 - IR)
    return exemptPercentOfCDI / (1 - periodTaxRate);
  };

  const calculateWithMonthlyPayout = (monthlyRate: number, hasTax: boolean) => {
    let totalNetProfit = 0;
    let totalGrossProfit = 0;
    let totalTax = 0;
    const details: MonthlyDetail[] = [];
    const evolution: { month: number; value: number }[] = [{ month: 0, value: principal }];

    for (let month = 1; month <= months; month++) {
      const days = month * 30;
      const monthTaxRate = hasTax ? getTaxRate(days) : 0;
      const grossProfit = principal * monthlyRate;
      const taxAmount = grossProfit * monthTaxRate;
      const netProfit = grossProfit - taxAmount;

      totalGrossProfit += grossProfit;
      totalTax += taxAmount;
      totalNetProfit += netProfit;

      details.push({
        month,
        principal,
        grossProfit,
        taxRate: monthTaxRate * 100,
        taxAmount,
        netProfit,
        accumulated: totalNetProfit
      });

      evolution.push({ month, value: principal + totalNetProfit });
    }

    return {
      grossTotal: principal + totalGrossProfit,
      netTotal: principal + totalNetProfit,
      totalTax,
      monthlyPayoutGross: principal * monthlyRate,
      details,
      evolution
    };
  };

  const calculateCompoundEvolution = (monthlyRate: number, hasTax: boolean) => {
    const evolution: { month: number; value: number }[] = [{ month: 0, value: principal }];

    for (let month = 1; month <= months; month++) {
      const gross = principal * Math.pow(1 + monthlyRate, month);
      const profit = gross - principal;
      const tax = hasTax ? profit * getTaxRate(month * 30) : 0;
      evolution.push({ month, value: gross - tax });
    }

    return evolution;
  };

  // 1. Fundo do Usuário
  const fundMonthlyRate = fundRateMonthly / 100;
  let fundResult;
  let fundAnnualGross, fundAnnualNet;
  let fundEvolution;

  if (globalPayoutMonthly) {
    fundResult = calculateWithMonthlyPayout(fundMonthlyRate, true);
    fundAnnualGross = monthlyToAnnualSimple(fundMonthlyRate);
    fundEvolution = fundResult.evolution;
  } else {
    const fundGross = principal * Math.pow(1 + fundMonthlyRate, months);
    const fundProfit = fundGross - principal;
    const fundTax = fundProfit * periodTaxRate;
    fundResult = {
      grossTotal: fundGross,
      netTotal: fundGross - fundTax,
      totalTax: fundTax,
      monthlyPayoutGross: 0,
      details: []
    };
    fundAnnualGross = monthlyToAnnualCompound(fundMonthlyRate);
    fundEvolution = calculateCompoundEvolution(fundMonthlyRate, true);
  }

  const fundNetMonthlyRate = Math.pow(fundResult.netTotal / principal, 1 / months) - 1;
  fundAnnualNet = globalPayoutMonthly
    ? monthlyToAnnualSimple(fundNetMonthlyRate)
    : monthlyToAnnualCompound(fundNetMonthlyRate);

  // % do CDI sempre usa taxa anual COMPOSTA, independente do pagamento mensal
  const fundAnnualForCDI = monthlyToAnnualCompound(fundMonthlyRate);

  results.push({
    type: 'fund',
    name: fundName,
    grossTotal: fundResult.grossTotal,
    taxAmount: fundResult.totalTax,
    taxRate: periodTaxRate * 100,
    netTotal: fundResult.netTotal,
    netReturnPercent: ((fundResult.netTotal - principal) / principal) * 100,
    monthlyReturnPercentOfCDI: calculatePercentOfCDI(fundAnnualForCDI),
    monthlyPayoutGross: fundResult.monthlyPayoutGross,
    monthlyPayoutNet: globalPayoutMonthly ? (fundResult.netTotal - principal) / months : 0,
    monthlyRateGross: fundMonthlyRate * 100,
    monthlyRateNet: fundNetMonthlyRate * 100,
    annualRateGross: fundAnnualGross,
    annualRateNet: fundAnnualNet,
    grossUp: 0,
    isUserFund: true,
    monthlyDetails: fundResult.details,
    evolutionData: fundEvolution
  });

  // 2. CDB
  const cdbMonthly = cdiMonthly * (cdbPercentOfCDI / 100);
  let cdbResult;
  let cdbEvolution;

  if (globalPayoutMonthly) {
    cdbResult = calculateWithMonthlyPayout(cdbMonthly, true);
    cdbEvolution = cdbResult.evolution;
  } else {
    const cdbGross = principal * Math.pow(1 + cdbMonthly, months);
    const cdbProfit = cdbGross - principal;
    const cdbTax = cdbProfit * periodTaxRate;
    cdbResult = {
      grossTotal: cdbGross,
      netTotal: cdbGross - cdbTax,
      totalTax: cdbTax,
      monthlyPayoutGross: 0,
      details: []
    };
    cdbEvolution = calculateCompoundEvolution(cdbMonthly, true);
  }

  const cdbAnnualGross = monthlyToAnnualCompound(cdbMonthly);
  const cdbNetMonthlyRate = Math.pow(cdbResult.netTotal / principal, 1 / months) - 1;
  const cdbAnnualNet = monthlyToAnnualCompound(cdbNetMonthlyRate);

  results.push({
    type: 'cdb',
    name: `CDB ${cdbPercentOfCDI}% CDI`,
    grossTotal: cdbResult.grossTotal,
    taxAmount: cdbResult.totalTax,
    taxRate: periodTaxRate * 100,
    netTotal: cdbResult.netTotal,
    netReturnPercent: ((cdbResult.netTotal - principal) / principal) * 100,
    monthlyReturnPercentOfCDI: cdbPercentOfCDI, // Usar valor contratado para evitar confusão com matemática composta
    monthlyPayoutGross: cdbResult.monthlyPayoutGross,
    monthlyPayoutNet: globalPayoutMonthly ? (cdbResult.netTotal - principal) / months : 0,
    monthlyRateGross: cdbMonthly * 100,
    monthlyRateNet: cdbNetMonthlyRate * 100,
    annualRateGross: cdbAnnualGross,
    annualRateNet: cdbAnnualNet,
    grossUp: 0,
    isUserFund: false,
    monthlyDetails: cdbResult.details,
    evolutionData: cdbEvolution
  });

  // 3. LCI
  const lciMonthly = cdiMonthly * (lciPercentOfCDI / 100);
  let lciResult;
  let lciEvolution;

  if (globalPayoutMonthly) {
    lciResult = calculateWithMonthlyPayout(lciMonthly, false);
    lciEvolution = lciResult.evolution;
  } else {
    const lciGross = principal * Math.pow(1 + lciMonthly, months);
    lciResult = {
      grossTotal: lciGross,
      netTotal: lciGross,
      totalTax: 0,
      monthlyPayoutGross: 0,
      details: []
    };
    lciEvolution = calculateCompoundEvolution(lciMonthly, false);
  }

  const lciAnnualGross = monthlyToAnnualCompound(lciMonthly);
  const lciGrossUp = calculateGrossUp(lciPercentOfCDI);

  results.push({
    type: 'lci',
    name: `LCI/LCA ${lciPercentOfCDI}% CDI`,
    grossTotal: lciResult.grossTotal,
    taxAmount: 0,
    taxRate: 0,
    netTotal: lciResult.netTotal,
    netReturnPercent: ((lciResult.netTotal - principal) / principal) * 100,
    monthlyReturnPercentOfCDI: lciPercentOfCDI, // Usar valor contratado para evitar confusão com matemática composta
    monthlyPayoutGross: lciResult.monthlyPayoutGross,
    monthlyPayoutNet: globalPayoutMonthly ? (lciResult.netTotal - principal) / months : 0,
    monthlyRateGross: lciMonthly * 100,
    monthlyRateNet: lciMonthly * 100,
    annualRateGross: lciAnnualGross,
    annualRateNet: lciAnnualGross,
    grossUp: lciGrossUp,
    isUserFund: false,
    monthlyDetails: lciResult.details,
    evolutionData: lciEvolution
  });

  // 4. Pré-fixado
  const preMonthly = annualToMonthlyCompound(preFixedAnnual);
  let preResult;
  let preEvolution;

  if (globalPayoutMonthly) {
    preResult = calculateWithMonthlyPayout(preMonthly, true);
    preEvolution = preResult.evolution;
  } else {
    const preGross = principal * Math.pow(1 + preMonthly, months);
    const preProfit = preGross - principal;
    const preTax = preProfit * periodTaxRate;
    preResult = {
      grossTotal: preGross,
      netTotal: preGross - preTax,
      totalTax: preTax,
      monthlyPayoutGross: 0,
      details: []
    };
    preEvolution = calculateCompoundEvolution(preMonthly, true);
  }

  const preNetMonthlyRate = Math.pow(preResult.netTotal / principal, 1 / months) - 1;
  const preAnnualNet = monthlyToAnnualCompound(preNetMonthlyRate);

  results.push({
    type: 'cdb',
    name: `Pré-fixado ${preFixedAnnual.toFixed(1)}% a.a.`,
    grossTotal: preResult.grossTotal,
    taxAmount: preResult.totalTax,
    taxRate: periodTaxRate * 100,
    netTotal: preResult.netTotal,
    netReturnPercent: ((preResult.netTotal - principal) / principal) * 100,
    monthlyReturnPercentOfCDI: calculatePercentOfCDI(preFixedAnnual),
    monthlyPayoutGross: preResult.monthlyPayoutGross,
    monthlyPayoutNet: globalPayoutMonthly ? (preResult.netTotal - principal) / months : 0,
    monthlyRateGross: preMonthly * 100,
    monthlyRateNet: preNetMonthlyRate * 100,
    annualRateGross: preFixedAnnual,
    annualRateNet: preAnnualNet,
    grossUp: 0,
    isUserFund: false,
    monthlyDetails: preResult.details,
    evolutionData: preEvolution
  });

  // 5. IPCA+
  const ipcaMonthly = annualToMonthlyCompound(ipcaAnnual);
  const spreadMonthly = ipcaPlusAnnual / 100 / 12;
  const ipcaPlusMonthly = ipcaMonthly + spreadMonthly;
  let ipcaPlusResult;
  let ipcaPlusEvolution;

  if (globalPayoutMonthly) {
    ipcaPlusResult = calculateWithMonthlyPayout(ipcaPlusMonthly, true);
    ipcaPlusEvolution = ipcaPlusResult.evolution;
  } else {
    const ipcaPlusGross = principal * Math.pow(1 + ipcaPlusMonthly, months);
    const ipcaPlusProfit = ipcaPlusGross - principal;
    const ipcaPlusTax = ipcaPlusProfit * periodTaxRate;
    ipcaPlusResult = {
      grossTotal: ipcaPlusGross,
      netTotal: ipcaPlusGross - ipcaPlusTax,
      totalTax: ipcaPlusTax,
      monthlyPayoutGross: 0,
      details: []
    };
    ipcaPlusEvolution = calculateCompoundEvolution(ipcaPlusMonthly, true);
  }

  const ipcaPlusNetMonthlyRate = Math.pow(ipcaPlusResult.netTotal / principal, 1 / months) - 1;
  const ipcaPlusAnnualGross = monthlyToAnnualCompound(ipcaPlusMonthly);
  const ipcaPlusAnnualNet = monthlyToAnnualCompound(ipcaPlusNetMonthlyRate);

  results.push({
    type: 'cdb',
    name: `IPCA+ ${ipcaPlusAnnual.toFixed(1)}%`,
    grossTotal: ipcaPlusResult.grossTotal,
    taxAmount: ipcaPlusResult.totalTax,
    taxRate: periodTaxRate * 100,
    netTotal: ipcaPlusResult.netTotal,
    netReturnPercent: ((ipcaPlusResult.netTotal - principal) / principal) * 100,
    monthlyReturnPercentOfCDI: calculatePercentOfCDI(ipcaPlusAnnualGross),
    monthlyPayoutGross: ipcaPlusResult.monthlyPayoutGross,
    monthlyPayoutNet: globalPayoutMonthly ? (ipcaPlusResult.netTotal - principal) / months : 0,
    monthlyRateGross: ipcaPlusMonthly * 100,
    monthlyRateNet: ipcaPlusNetMonthlyRate * 100,
    annualRateGross: ipcaPlusAnnualGross,
    annualRateNet: ipcaPlusAnnualNet,
    grossUp: 0,
    isUserFund: false,
    monthlyDetails: ipcaPlusResult.details,
    evolutionData: ipcaPlusEvolution
  });

  // 6. Fundo de Comparação
  if (comparisonFund12MonthReturn > 0) {
    const compMonthlyRate = Math.pow(1 + comparisonFund12MonthReturn / 100, 1 / 12) - 1;
    let compResult;
    let compEvolution;

    if (globalPayoutMonthly) {
      compResult = calculateWithMonthlyPayout(compMonthlyRate, true);
      compEvolution = compResult.evolution;
    } else {
      const compGross = principal * Math.pow(1 + compMonthlyRate, months);
      const compProfit = compGross - principal;
      const compTax = compProfit * periodTaxRate;
      compResult = {
        grossTotal: compGross,
        netTotal: compGross - compTax,
        totalTax: compTax,
        monthlyPayoutGross: 0,
        details: []
      };
      compEvolution = calculateCompoundEvolution(compMonthlyRate, true);
    }

    const compNetMonthlyRate = Math.pow(compResult.netTotal / principal, 1 / months) - 1;
    const compAnnualGross = monthlyToAnnualCompound(compMonthlyRate);
    const compAnnualNet = monthlyToAnnualCompound(compNetMonthlyRate);

    results.push({
      type: 'comparison',
      name: `Fundos (Tx ult 12m: ${comparisonFund12MonthReturn.toFixed(1)}%)`,
      grossTotal: compResult.grossTotal,
      taxAmount: compResult.totalTax,
      taxRate: periodTaxRate * 100,
      netTotal: compResult.netTotal,
      netReturnPercent: ((compResult.netTotal - principal) / principal) * 100,
      monthlyReturnPercentOfCDI: calculatePercentOfCDI(compAnnualGross),
      monthlyPayoutGross: compResult.monthlyPayoutGross,
      monthlyPayoutNet: globalPayoutMonthly ? (compResult.netTotal - principal) / months : 0,
      monthlyRateGross: compMonthlyRate * 100,
      monthlyRateNet: compNetMonthlyRate * 100,
      annualRateGross: compAnnualGross,
      annualRateNet: compAnnualNet,
      grossUp: 0,
      isUserFund: false,
      monthlyDetails: compResult.details,
      evolutionData: compEvolution
    });
  }

  // 7. Poupança
  const poupancaMonthly = 0.005 + 0.0017;
  const poupancaGross = principal * Math.pow(1 + poupancaMonthly, months);
  const poupancaAnnualGross = monthlyToAnnualCompound(poupancaMonthly);
  const poupancaGrossUp = calculateGrossUp(calculatePercentOfCDI(poupancaAnnualGross));
  const poupancaEvolution = calculateCompoundEvolution(poupancaMonthly, false);

  results.push({
    type: 'poupanca',
    name: 'Poupança',
    grossTotal: poupancaGross,
    taxAmount: 0,
    taxRate: 0,
    netTotal: poupancaGross,
    netReturnPercent: ((poupancaGross - principal) / principal) * 100,
    monthlyReturnPercentOfCDI: calculatePercentOfCDI(poupancaAnnualGross),
    monthlyPayoutGross: 0,
    monthlyPayoutNet: 0,
    monthlyRateGross: poupancaMonthly * 100,
    monthlyRateNet: poupancaMonthly * 100,
    annualRateGross: poupancaAnnualGross,
    annualRateNet: poupancaAnnualGross,
    grossUp: poupancaGrossUp,
    isUserFund: false,
    monthlyDetails: [],
    evolutionData: poupancaEvolution
  });

  const userFund = results.filter(r => r.isUserFund);
  const otherFunds = results.filter(r => !r.isUserFund).sort((a, b) => b.netTotal - a.netTotal);

  return [...userFund, ...otherFunds];
};

function App() {
  const [params, setParams] = useState<SimulationParams>({
    principal: 100000,
    months: 24,
    cdiAnnual: 14.90,
    ipcaAnnual: 5.17,
    fundName: 'Meu Fundo',
    fundRateMonthly: 1.5,
    cdbPercentOfCDI: 105,
    lciPercentOfCDI: 90,
    preFixedAnnual: 12.5,
    ipcaPlusAnnual: 6.0,
    comparisonFund12MonthReturn: 14.0,
    globalPayoutMonthly: false,
  });

  const [results, setResults] = useState<SimulationResult[]>([]);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'cards' | 'chart' | 'table'>('cards');
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfOptions, setPdfOptions] = useState({
    includeCards: true,
    includeChart: true,
    includeTable: true
  });
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const cardsRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const [loadingRates, setLoadingRates] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);

  // Remover overflow do body/html para evitar barras de rolagem duplicadas
  useEffect(() => {
    // Salvar estilos originais
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    // Aplicar overflow hidden
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';

    // Cleanup: restaurar estilos originais ao desmontar
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  // Buscar taxas do Banco Central
  useEffect(() => {
    const fetchEconomicRates = async () => {
      setLoadingRates(true);
      setRatesError(null);

      try {
        // Série 12: Taxa de juros - CDI acumulada no dia (% a.d.)
        // Série 13522: IPCA - Variação acumulada em 12 meses (%)

        const today = new Date();
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(today.getFullYear() - 1);

        const formatDate = (date: Date) => {
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
        };

        const startDate = formatDate(oneYearAgo);
        const endDate = formatDate(today);

        // Buscar CDI Diário (série 12)
        const cdiResponse = await fetch(
          `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${startDate}&dataFinal=${endDate}`
        );

        // Buscar IPCA acumulado 12 meses (série 13522)
        const ipcaResponse = await fetch(
          `https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados?formato=json&dataInicial=${startDate}&dataFinal=${endDate}`
        );

        if (cdiResponse.ok && ipcaResponse.ok) {
          const cdiData = await cdiResponse.json();
          const ipcaData = await ipcaResponse.json();

          let cdiUpdated = false;
          let ipcaUpdated = false;

          if (cdiData.length > 0) {
            // Pegar o último valor diário disponível
            const latestCDIDaily = parseFloat(cdiData[cdiData.length - 1].valor);

            // Anualizar: (1 + taxa_diaria/100)^252 - 1
            const latestCDIAnnual = (Math.pow(1 + latestCDIDaily / 100, 252) - 1) * 100;
            const roundedCDIAnnual = parseFloat(latestCDIAnnual.toFixed(2));

            setParams(prev => ({ ...prev, cdiAnnual: roundedCDIAnnual }));
            cdiUpdated = true;
            console.log('✅ CDI atualizado:', `${roundedCDIAnnual}% a.a. (base diária: ${latestCDIDaily}%)`);
          }

          if (ipcaData.length > 0) {
            const latestIPCA = parseFloat(ipcaData[ipcaData.length - 1].valor);
            setParams(prev => ({ ...prev, ipcaAnnual: latestIPCA }));
            ipcaUpdated = true;
            console.log('✅ IPCA atualizado:', `${latestIPCA.toFixed(2)}% (12 meses)`);
          }

          if (cdiUpdated && ipcaUpdated) {
            // Ambos atualizados com sucesso
          } else if (!cdiUpdated && !ipcaUpdated) {
            throw new Error('Nenhum dado disponível');
          } else {
            setRatesError(cdiUpdated ? 'IPCA não atualizado' : 'CDI não atualizado');
          }
        } else {
          throw new Error('Dados não disponíveis');
        }
      } catch (error) {
        console.warn('⚠️ Não foi possível buscar taxas do BCB, usando valores padrão:', error);
        setRatesError('Usando taxas padrão (não foi possível conectar ao Banco Central)');
        // Mantém os valores padrão já definidos
      } finally {
        setLoadingRates(false);
      }
    };

    fetchEconomicRates();
  }, []); // Executa apenas uma vez ao carregar

  useEffect(() => {
    setResults(calculateSimulations(params));
  }, [params]);

  const userFund = results.find(r => r.isUserFund);
  const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1'];

  // Calcular diferencial vs fundo do usuário
  const getDifferential = (result: SimulationResult) => {
    if (!userFund || result.isUserFund) return null;
    const diff = result.netTotal - userFund.netTotal;
    const diffPercent = (diff / userFund.netTotal) * 100;
    return { value: diff, percent: diffPercent };
  };

  // Renderizar gráfico de barras - Rendimento Líquido
  const renderBarChart = () => {
    if (results.length === 0) return null;

    const width = 900;
    const height = 400;
    const padding = { top: 80, right: 40, bottom: 120, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxValue = Math.max(...results.map(r => r.netTotal - params.principal));
    const barWidth = chartWidth / results.length - 10;

    return (
      <div style={{ marginBottom: '40px' }}>
        <svg width={width} height={height} style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
          {/* Title */}
          <text x={width / 2} y={30} fill="#e2e8f0" fontSize="18" fontWeight="bold" textAnchor="middle">
            📊 Rendimento Líquido por Investimento
          </text>

          {/* Subtitle with parameters */}
          <text x={width / 2} y={50} fill="#94a3b8" fontSize="11" textAnchor="middle">
            Prazo {params.months} meses | IR {getTaxRate(params.months) * 100}% | CDI {params.cdiAnnual.toFixed(1)}% a.a. | Aporte {params.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })}
          </text>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = padding.top + chartHeight * (1 - ratio);
            const value = maxValue * ratio;
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray="4,4"
                  opacity="0.5"
                />
                <text x={padding.left - 10} y={y + 4} fill="#94a3b8" fontSize="11" textAnchor="end" fontWeight="500">
                  {value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {results.map((result, idx) => {
            const netProfit = result.netTotal - params.principal;
            const barHeight = (netProfit / maxValue) * chartHeight;
            const x = padding.left + idx * (chartWidth / results.length) + 5;
            const y = padding.top + chartHeight - barHeight;
            const color = result.isUserFund ? '#10b981' : '#06b6d4';

            return (
              <g key={result.name}>
                {/* Bar shadow */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  opacity="0.2"
                  filter="blur(8px)"
                />
                {/* Main bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  rx="4"
                  opacity="0.9"
                />
                {/* Value label on top of bar */}
                <text
                  x={x + barWidth / 2}
                  y={y - 8}
                  fill="#e2e8f0"
                  fontSize="12"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {netProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </text>
                {/* Investment name below bar - horizontal */}
                <foreignObject
                  x={x}
                  y={padding.top + chartHeight + 15}
                  width={barWidth}
                  height={80}
                >
                  <div style={{
                    color: '#cbd5e1',
                    fontSize: '10px',
                    fontWeight: result.isUserFund ? 'bold' : 'normal',
                    textAlign: 'center',
                    lineHeight: '1.2',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {result.name}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  // Renderizar gráfico SVG
  const renderChart = () => {
    if (results.length === 0) return null;

    const width = 900;
    const height = 450;
    const padding = { top: 40, right: 20, bottom: 80, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxValue = Math.max(...results.flatMap(r => r.evolutionData.map(d => d.value)));
    const minValue = Math.min(...results.flatMap(r => r.evolutionData.map(d => d.value)));
    const maxMonth = params.months;

    const xScale = (month: number) => padding.left + (month / maxMonth) * chartWidth;
    const yScale = (value: number) => padding.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <svg width={width} height={height} style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
          {/* Gradient definitions */}
          <defs>
            <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#1e293b', stopOpacity: 0.8 }} />
              <stop offset="100%" style={{ stopColor: '#0f172a', stopOpacity: 0.3 }} />
            </linearGradient>
          </defs>

          {/* Background area */}
          <rect
            x={padding.left}
            y={padding.top}
            width={chartWidth}
            height={chartHeight}
            fill="url(#chartGradient)"
            rx="8"
          />

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = padding.top + chartHeight * (1 - ratio);
            const value = minValue + (maxValue - minValue) * ratio;
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray="4,4"
                  opacity="0.5"
                />
                <text x={padding.left - 10} y={y + 4} fill="#94a3b8" fontSize="11" textAnchor="end" fontWeight="500">
                  {value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {[0, 6, 12, 18, 24].filter(m => m <= maxMonth).map((month) => (
            <text
              key={month}
              x={xScale(month)}
              y={height - padding.bottom + 20}
              fill="#94a3b8"
              fontSize="12"
              textAnchor="middle"
              fontWeight="500"
            >
              {month}m
            </text>
          ))}

          {/* Lines with glow effect */}
          {results.map((result, idx) => {
            const points = result.evolutionData.map(d => `${xScale(d.month)},${yScale(d.value)}`).join(' ');
            const color = result.isUserFund ? '#10b981' : colors[idx % colors.length];
            return (
              <g key={result.name}>
                {/* Glow effect */}
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={result.isUserFund ? "6" : "4"}
                  opacity="0.2"
                  filter="blur(4px)"
                />
                {/* Main line */}
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={result.isUserFund ? "3" : "2"}
                  opacity="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Data points */}
                {result.evolutionData.map((point, i) => (
                  <circle
                    key={i}
                    cx={xScale(point.month)}
                    cy={yScale(point.value)}
                    r={result.isUserFund ? "4" : "3"}
                    fill={color}
                    opacity={i === 0 || i === result.evolutionData.length - 1 ? "1" : "0.6"}
                  />
                ))}
              </g>
            );
          })}

          {/* Title */}
          <text x={width / 2} y={25} fill="#e2e8f0" fontSize="18" fontWeight="bold" textAnchor="middle">
            📈 Evolução do Patrimônio
          </text>
        </svg>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', maxWidth: '800px' }}>
          {results.map((result, idx) => (
            <div key={result.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '24px',
                height: '4px',
                backgroundColor: result.isUserFund ? '#10b981' : colors[idx % colors.length],
                borderRadius: '2px',
                boxShadow: `0 0 8px ${result.isUserFund ? '#10b981' : colors[idx % colors.length]}`
              }} />
              <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: result.isUserFund ? '700' : '500' }}>
                {result.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Estado para controlar a renderização do relatório oculto
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Refs para as seções do relatório PDF
  const reportHeaderRef = useRef<HTMLDivElement>(null);
  const reportChartsRef = useRef<HTMLDivElement>(null);

  const generatePDF = async () => {
    if (generatingPdf) return;

    try {
      setGeneratingPdf(true);
      setIsGeneratingReport(true); // Ativa a renderização do relatório oculto

      // Aguardar renderização do React
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);

      // Função auxiliar para adicionar imagem ao PDF
      const addSectionToPdf = async (element: HTMLElement, addPageBreak = false) => {
        if (!element) return;

        if (addPageBreak) pdf.addPage();

        const canvas = await html2canvas(element, {
          scale: 2, // Melhor qualidade
          backgroundColor: '#0f172a', // Fundo escuro consistente
          logging: false,
          useCORS: true
        });

        const imgData = canvas.toDataURL('image/png');
        const imgProps = pdf.getImageProperties(imgData);
        const imgHeight = (imgProps.height * contentWidth) / imgProps.width;

        pdf.addImage(imgData, 'PNG', margin, margin, contentWidth, imgHeight);
      };

      // --- PÁGINA 1: Header, Parâmetros, Cards, Gráfico de Barras ---
      if (reportHeaderRef.current) {
        await addSectionToPdf(reportHeaderRef.current);
      }

      // --- PÁGINA 2: Gráfico Evolução, Tabela, Disclaimer ---
      if (reportChartsRef.current) {
        await addSectionToPdf(reportChartsRef.current, true); // true = nova página
      }

      // Open PDF in new tab with friendly filename
      const fileName = `ComparaInvest_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
      const pdfBlob = pdf.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);

      const newWindow = window.open(pdfUrl, '_blank');
      if (newWindow) {
        newWindow.document.title = fileName;
      }

      setShowPdfModal(false);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Por favor, tente novamente.');
    } finally {
      setGeneratingPdf(false);
      setIsGeneratingReport(false); // Limpa o relatório oculto
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      height: '100vh',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      backgroundColor: '#020617',
      backgroundImage: 'radial-gradient(circle at 50% 0%, #1e293b 0%, #020617 100%)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* HEADER FIXO */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'rgba(2, 6, 23, 0.95)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #1e293b',
        padding: '16px 20px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Ícone */}
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}>
                💰
              </div>
              <div>
                <h1 style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  margin: 0,
                  background: 'linear-gradient(to right, #ffffff, #10b981)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  Comparador de Investimentos
                </h1>
                <p style={{ color: '#64748b', fontSize: '11px', margin: '2px 0 0 0' }}>
                  Análise completa com IR regressivo e gross-up
                </p>
              </div>
            </div>

            {/* View Toggle */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px', backgroundColor: '#1e293b', padding: '4px', borderRadius: '8px' }}>
                {(['cards', 'chart', 'table'] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => setActiveView(view)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: activeView === view ? '#10b981' : 'transparent',
                      color: activeView === view ? '#020617' : '#94a3b8',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      transition: 'all 0.2s'
                    }}
                  >
                    {view === 'cards' ? '📊 Cards' : view === 'chart' ? '📈 Gráfico' : '📋 Tabela'}
                  </button>
                ))}
              </div>

              {/* PDF Export Button */}
              <button
                onClick={() => setShowPdfModal(true)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
              >
                📄 Gerar PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CONTEÚDO ROLÁVEL */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px' }}>
            {/* Controls */}
            <div>
              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '14px'
              }}>
                <h2 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#10b981' }}>
                  Seu Fundo
                </h2>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Nome
                  </label>
                  <input
                    type="text"
                    value={params.fundName}
                    onChange={(e) => setParams({ ...params, fundName: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#020617',
                      border: '1px solid #1e293b',
                      borderRadius: '5px',
                      padding: '6px',
                      color: 'white',
                      fontSize: '12px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Taxa Mensal</span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#10b981' }}>
                      {params.fundRateMonthly.toFixed(1)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="2.0"
                    step="0.1"
                    value={params.fundRateMonthly}
                    onChange={(e) => setParams({ ...params, fundRateMonthly: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#10b981' }}
                  />
                </div>

                <div style={{ borderTop: '1px solid #1e293b', paddingTop: '12px', marginTop: '12px' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                    Parâmetros
                  </h2>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                        Aporte (R$)
                      </label>
                      <input
                        type="number"
                        value={params.principal}
                        onChange={(e) => setParams({ ...params, principal: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: '#020617',
                          border: '1px solid #1e293b',
                          borderRadius: '5px',
                          padding: '5px',
                          color: 'white',
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                        Meses
                      </label>
                      <input
                        type="number"
                        value={params.months}
                        onChange={(e) => setParams({ ...params, months: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: '#020617',
                          border: '1px solid #1e293b',
                          borderRadius: '5px',
                          padding: '5px',
                          color: 'white',
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                        CDI (% a.a.)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={params.cdiAnnual}
                        onChange={(e) => setParams({ ...params, cdiAnnual: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: '#020617',
                          border: '1px solid #1e293b',
                          borderRadius: '5px',
                          padding: '5px',
                          color: 'white',
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                        CDB (% CDI)
                      </label>
                      <input
                        type="number"
                        value={params.cdbPercentOfCDI}
                        onChange={(e) => setParams({ ...params, cdbPercentOfCDI: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: '#020617',
                          border: '1px solid #1e293b',
                          borderRadius: '5px',
                          padding: '5px',
                          color: 'white',
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                        LCI (% CDI)
                      </label>
                      <input
                        type="number"
                        value={params.lciPercentOfCDI}
                        onChange={(e) => setParams({ ...params, lciPercentOfCDI: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: '#020617',
                          border: '1px solid #1e293b',
                          borderRadius: '5px',
                          padding: '5px',
                          color: 'white',
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                        Pré (% a.a.)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={params.preFixedAnnual}
                        onChange={(e) => setParams({ ...params, preFixedAnnual: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: '#020617',
                          border: '1px solid #1e293b',
                          borderRadius: '5px',
                          padding: '5px',
                          color: 'white',
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                        IPCA (% a.a.)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={params.ipcaAnnual}
                        onChange={(e) => setParams({ ...params, ipcaAnnual: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: '#020617',
                          border: '1px solid #1e293b',
                          borderRadius: '5px',
                          padding: '5px',
                          color: 'white',
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                        IPCA+ (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={params.ipcaPlusAnnual}
                        onChange={(e) => setParams({ ...params, ipcaPlusAnnual: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: '#020617',
                          border: '1px solid #1e293b',
                          borderRadius: '5px',
                          padding: '5px',
                          color: 'white',
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                      Fundo Comp. (% 12m)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={params.comparisonFund12MonthReturn}
                      onChange={(e) => setParams({ ...params, comparisonFund12MonthReturn: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        backgroundColor: '#020617',
                        border: '1px solid #1e293b',
                        borderRadius: '5px',
                        padding: '5px',
                        color: 'white',
                        fontSize: '11px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#020617',
                    padding: '8px',
                    borderRadius: '5px',
                    border: '1px solid #1e293b'
                  }}>
                    <span style={{ fontSize: '11px', color: '#cbd5e1' }}>Pagamento Mensal</span>
                    <button
                      onClick={() => setParams({ ...params, globalPayoutMonthly: !params.globalPayoutMonthly })}
                      style={{
                        width: '40px',
                        height: '20px',
                        borderRadius: '10px',
                        backgroundColor: params.globalPayoutMonthly ? '#10b981' : '#475569',
                        border: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background-color 0.3s'
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        left: params.globalPayoutMonthly ? '22px' : '2px',
                        width: '16px',
                        height: '16px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transition: 'left 0.3s'
                      }} />
                    </button>
                  </div>
                  <p style={{ fontSize: '9px', color: '#64748b', marginTop: '4px', lineHeight: '1.2' }}>
                    {params.globalPayoutMonthly
                      ? "Juros Simples - IR regressivo"
                      : "Juros Compostos - IR no resgate"}
                  </p>
                </div>

                {/* Indicador de Status das Taxas - NO FINAL */}
                <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #1e293b' }}>
                  {loadingRates ? (
                    <div style={{
                      fontSize: '9px',
                      color: '#64748b',
                      padding: '6px',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span>⏳</span>
                      <span>Buscando taxas BCB...</span>
                    </div>
                  ) : ratesError ? (
                    <div style={{
                      fontSize: '9px',
                      color: '#f59e0b',
                      padding: '6px',
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.2)',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span>⚠️</span>
                      <span>{ratesError}</span>
                    </div>
                  ) : (
                    <div style={{
                      fontSize: '9px',
                      color: '#10b981',
                      padding: '6px',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span>✅</span>
                      <span>Taxa CDI e IPCA a.a. atualizadas</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div>
              {activeView === 'cards' && (
                <div ref={cardsRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {results.map((res) => {
                    const diff = getDifferential(res);
                    return (
                      <div
                        key={res.name}
                        style={{
                          position: 'relative',
                          padding: '12px',
                          borderRadius: '10px',
                          border: res.isUserFund ? '2px solid #10b981' : '1px solid #1e293b',
                          backgroundColor: res.isUserFund ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.4)',
                          transition: 'transform 0.2s',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                        onMouseEnter={(e) => !res.isUserFund && (e.currentTarget.style.transform = 'translateY(-4px)')}
                        onMouseLeave={(e) => !res.isUserFund && (e.currentTarget.style.transform = 'translateY(0)')}
                      >
                        {res.isUserFund && (
                          <div style={{
                            position: 'absolute',
                            top: '-9px',
                            left: '10px',
                            backgroundColor: '#10b981',
                            color: '#020617',
                            fontSize: '9px',
                            fontWeight: 'bold',
                            padding: '2px 8px',
                            borderRadius: '8px'
                          }}>
                            SEU FUNDO
                          </div>
                        )}

                        <h3 style={{
                          fontSize: '14px',
                          fontWeight: '700',
                          marginTop: res.isUserFund ? '6px' : '0',
                          marginBottom: '8px',
                          background: res.isUserFund
                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                            : 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                          letterSpacing: '-0.02em'
                        }}>
                          {res.name}
                        </h3>

                        {/* Aporte e Prazo - Simples */}
                        <div style={{
                          fontSize: '10px',
                          color: '#64748b',
                          marginBottom: '10px',
                          paddingBottom: '8px',
                          borderBottom: '1px solid #1e293b'
                        }}>
                          {params.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })} • {params.months} meses
                        </div>

                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>
                          {res.monthlyReturnPercentOfCDI.toFixed(1)}% CDI
                          {res.grossUp > 0 && ` • Gross-up: ${res.grossUp.toFixed(1)}%`}
                        </div>

                        <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '8px', lineHeight: '1.3' }}>
                          <div>
                            <span style={{ color: '#64748b' }}>Mensal:</span>{' '}
                            <span style={{ color: '#cbd5e1' }}>{res.monthlyRateGross.toFixed(3)}% <span style={{ fontSize: '8px' }}>bruto</span></span>
                            {' / '}
                            <span style={{ color: '#10b981' }}>{res.monthlyRateNet.toFixed(3)}% <span style={{ fontSize: '8px' }}>líq</span></span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Anual:</span>{' '}
                            <span style={{ color: '#cbd5e1' }}>{res.annualRateGross.toFixed(2)}% <span style={{ fontSize: '8px' }}>bruto</span></span>
                            {' / '}
                            <span style={{ color: '#10b981' }}>{res.annualRateNet.toFixed(2)}% <span style={{ fontSize: '8px' }}>líq</span></span>
                          </div>
                        </div>

                        {params.globalPayoutMonthly && res.monthlyPayoutGross > 0 && (
                          <div style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            padding: '6px',
                            borderRadius: '5px',
                            marginBottom: '8px',
                            border: '1px solid rgba(16, 185, 129, 0.2)'
                          }}>
                            <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '1px' }}>Crédito Mensal</div>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#10b981' }}>
                              {res.monthlyPayoutGross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} bruto
                            </div>
                            <div style={{ fontSize: '9px', color: '#10b981' }}>
                              {res.monthlyPayoutNet.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} líq
                            </div>
                          </div>
                        )}

                        <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                          <span style={{ color: '#94a3b8' }}>Bruto</span>
                          <span style={{ fontWeight: '600', color: '#e2e8f0' }}>
                            {res.grossTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>

                        <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                          <span style={{ color: '#94a3b8' }}>
                            IR {res.taxRate > 0 ? `${res.taxRate.toFixed(1)}%` : ''}
                          </span>
                          <span style={{ fontWeight: '500', color: '#f87171' }}>
                            - {res.taxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>

                        <div style={{
                          paddingTop: '8px',
                          borderTop: '1px solid rgba(100, 116, 139, 0.3)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-end',
                          marginBottom: '8px'
                        }}>
                          <span style={{ fontSize: '10px', color: '#10b981', fontWeight: '500' }}>Líquido</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '15px', fontWeight: 'bold', color: 'white' }}>
                              {res.netTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                            <div style={{ fontSize: '9px', color: '#10b981', fontWeight: '500' }}>
                              +{res.netReturnPercent.toFixed(2)}%
                            </div>
                          </div>
                        </div>

                        {res.monthlyDetails.length > 0 && (
                          <button
                            onClick={() => setExpandedCard(expandedCard === res.name ? null : res.name)}
                            style={{
                              width: '100%',
                              padding: '5px',
                              backgroundColor: '#1e293b',
                              border: '1px solid #334155',
                              borderRadius: '5px',
                              color: '#94a3b8',
                              fontSize: '9px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              marginBottom: '8px'
                            }}
                          >
                            {expandedCard === res.name ? '▲' : '▼'} Detalhes Mês a Mês
                          </button>
                        )}

                        {expandedCard === res.name && res.monthlyDetails.length > 0 && (
                          <div style={{
                            marginBottom: '8px',
                            maxHeight: '150px',
                            overflowY: 'auto',
                            backgroundColor: '#0f172a',
                            borderRadius: '5px',
                            padding: '6px'
                          }}>
                            <table style={{ width: '100%', fontSize: '8px', color: '#cbd5e1' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #334155' }}>
                                  <th style={{ textAlign: 'left', padding: '3px' }}>Mês</th>
                                  <th style={{ textAlign: 'right', padding: '3px' }}>Bruto</th>
                                  <th style={{ textAlign: 'right', padding: '3px' }}>IR%</th>
                                  <th style={{ textAlign: 'right', padding: '3px' }}>Líq.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {res.monthlyDetails.map((detail) => (
                                  <tr key={detail.month} style={{ borderBottom: '1px solid #1e293b' }}>
                                    <td style={{ padding: '3px' }}>{detail.month}</td>
                                    <td style={{ textAlign: 'right', padding: '3px' }}>
                                      {detail.grossProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '3px' }}>{detail.taxRate.toFixed(1)}%</td>
                                    <td style={{ textAlign: 'right', padding: '3px', color: '#10b981' }}>
                                      {detail.netProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Comparação vs Seu Fundo - COMPACTO 2 LINHAS */}
                        {diff && (
                          <div style={{
                            padding: '6px 8px',
                            borderRadius: '5px',
                            marginTop: 'auto',
                            backgroundColor: diff.value > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            border: `1px solid ${diff.value > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                          }}>
                            <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '2px' }}>
                              vs {userFund?.name}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={{ fontSize: '13px', fontWeight: 'bold', color: diff.value > 0 ? '#ef4444' : '#10b981' }}>
                                {diff.value > 0 ? '+' : ''}{diff.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                              <span style={{ fontSize: '10px', color: diff.value > 0 ? '#ef4444' : '#10b981' }}>
                                ({diff.value > 0 ? '+' : ''}{diff.percent.toFixed(2)}%)
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {activeView === 'chart' && (
                <div ref={chartRef} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 0' }}>
                  {renderBarChart()}
                  {renderChart()}
                </div>
              )}

              {activeView === 'table' && (
                <div ref={tableRef} style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '20px',
                  overflowX: 'auto'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#e2e8f0', margin: 0 }}>
                      Comparação Detalhada
                    </h2>
                    <div style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: '#10b981',
                      fontWeight: '600'
                    }}>
                      📊 CDI Referência: {params.cdiAnnual.toFixed(2)}% a.a.
                    </div>
                  </div>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #334155' }}>
                        <th style={{ textAlign: 'left', padding: '12px', color: '#94a3b8' }}>Investimento</th>
                        <th style={{ textAlign: 'right', padding: '12px', color: '#94a3b8' }}>
                          % CDI
                        </th>
                        <th style={{ textAlign: 'right', padding: '12px', color: '#94a3b8' }}>
                          Taxa Mensal
                          <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 'normal' }}>bruto / líquido</div>
                        </th>
                        <th style={{ textAlign: 'right', padding: '12px', color: '#94a3b8' }}>
                          Taxa Anual
                          <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 'normal' }}>bruto / líquido</div>
                        </th>
                        <th style={{ textAlign: 'right', padding: '12px', color: '#94a3b8' }}>Total Bruto</th>
                        <th style={{ textAlign: 'right', padding: '12px', color: '#94a3b8' }}>IR</th>
                        <th style={{ textAlign: 'right', padding: '12px', color: '#94a3b8' }}>Total Líquido</th>
                        <th style={{ textAlign: 'right', padding: '12px', color: '#94a3b8' }}>Rentabilidade</th>
                        <th style={{ textAlign: 'right', padding: '12px', color: '#94a3b8' }}>vs {userFund?.name}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((res) => {
                        const diff = getDifferential(res);
                        return (
                          <tr
                            key={res.name}
                            style={{
                              borderBottom: '1px solid #1e293b',
                              backgroundColor: res.isUserFund ? 'rgba(16, 185, 129, 0.1)' : 'transparent'
                            }}
                          >
                            <td style={{ padding: '12px', color: '#e2e8f0', fontWeight: res.isUserFund ? 'bold' : 'normal' }}>
                              {res.name}
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: '#10b981', fontWeight: '600' }}>
                              {res.monthlyReturnPercentOfCDI.toFixed(1)}%
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: '#cbd5e1' }}>
                              {res.monthlyRateGross.toFixed(3)}% / {res.monthlyRateNet.toFixed(3)}%
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: '#cbd5e1' }}>
                              {res.annualRateGross.toFixed(2)}% / {res.annualRateNet.toFixed(2)}%
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: '#cbd5e1' }}>
                              {res.grossTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: '#f87171' }}>
                              {res.taxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: '#10b981', fontWeight: 'bold' }}>
                              {res.netTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: '#10b981' }}>
                              +{res.netReturnPercent.toFixed(2)}%
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: diff ? (diff.value > 0 ? '#ef4444' : '#10b981') : '#64748b' }}>
                              {diff ? `${diff.value > 0 ? '+' : ''}${diff.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Disclaimer Footer */}
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            borderTop: '1px solid #1e293b',
            padding: '12px 20px',
            marginTop: 'auto'
          }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', color: '#64748b', margin: 0, lineHeight: '1.5' }}>
                ⚠️ <strong>Aviso:</strong> Este é um simulador educacional. Os resultados são estimativas e não constituem recomendação de investimento.
                Rentabilidade passada não garante resultados futuros. Consulte um assessor certificado antes de investir.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* --- HIDDEN REPORT CONTAINER FOR PDF GENERATION --- */}
      {isGeneratingReport && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: -10000,
          width: '1000px', // Largura fixa para A4
          backgroundColor: '#0f172a',
          color: 'white',
          fontFamily: 'Inter, sans-serif',
          zIndex: -1
        }}>

          {/* --- PÁGINA 1: HEADER, PARÂMETROS, CARDS, GRÁFICO BARRAS --- */}
          <div ref={reportHeaderRef} style={{ padding: '40px', paddingBottom: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981', margin: 0 }}>
                  💰 ComparaInvest
                </h1>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                  Relatório de Simulação
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>Gerado em</p>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#e2e8f0', margin: 0 }}>
                  {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
                </p>
              </div>
            </div>

            {/* Parâmetros - Com altura automática e padding seguro */}
            <div style={{
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              borderRadius: '8px',
              padding: '15px',
              border: '1px solid #334155',
              marginBottom: '20px',
              overflow: 'hidden' // Garantir que nada vaze
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '5px' }}>
                Parâmetros da Simulação
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div>
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '1px' }}>Aporte Inicial</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#10b981' }}>
                    {params.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '1px' }}>Prazo</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#e2e8f0' }}>{params.months} meses</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '1px' }}>Taxa CDI</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#e2e8f0' }}>{params.cdiAnnual.toFixed(2)}% a.a.</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '1px' }}>IPCA</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#e2e8f0' }}>{params.ipcaAnnual.toFixed(2)}% a.a.</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '1px' }}>Imposto de Renda</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#e2e8f0' }}>
                    {/* Correção: converter meses em dias para getTaxRate */}
                    {(getTaxRate(params.months * 30) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Cards */}
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '10px', borderLeft: '3px solid #10b981', paddingLeft: '10px' }}>
                Comparativo de Resultados
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {results.map((res) => {
                  const diff = getDifferential(res);
                  return (
                    <div key={res.name} style={{
                      backgroundColor: '#1e293b',
                      borderRadius: '8px',
                      padding: '12px',
                      border: res.isUserFund ? '1px solid #10b981' : '1px solid #334155'
                    }}>
                      <div style={{ marginBottom: '8px', textAlign: 'center' }}>
                        <h3 style={{
                          fontSize: '12px',
                          fontWeight: 'bold',
                          color: res.isUserFund ? '#10b981' : '#3b82f6',
                          margin: 0,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {res.name}
                        </h3>
                        <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                          {res.monthlyReturnPercentOfCDI.toFixed(1)}% CDI
                          {/* Adicionado Gross-up se houver */}
                          {res.grossUp > 0 && ` • Gross-up: ${res.grossUp.toFixed(1)}%`}
                        </p>
                      </div>

                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>Bruto</span>
                          <span style={{ fontSize: '10px', color: '#e2e8f0' }}>
                            {res.grossTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>IR</span>
                          <span style={{ fontSize: '10px', color: '#ef4444' }}>
                            - {res.taxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                        <div style={{ borderTop: '1px solid #334155', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#10b981' }}>Líquido</span>
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#e2e8f0' }}>
                            {res.netTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                      </div>

                      {!res.isUserFund && diff && (
                        <div style={{
                          backgroundColor: 'rgba(15, 23, 42, 0.5)',
                          borderRadius: '4px',
                          padding: '4px',
                          textAlign: 'center',
                          border: '1px solid #334155'
                        }}>
                          {/* Garantindo que o título apareça */}
                          <p style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '1px', display: 'block' }}>
                            vs Seu Fundo
                          </p>
                          <p style={{
                            fontSize: '10px',
                            fontWeight: 'bold',
                            color: diff.value > 0 ? '#ef4444' : '#10b981',
                            margin: 0
                          }}>
                            {diff.value > 0 ? '+' : ''}{diff.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Gráfico de Barras (Rendimento Líquido) */}
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '15px', borderLeft: '3px solid #10b981', paddingLeft: '10px' }}>
                Rendimento Líquido
              </h2>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {/* Renderizar versão modificada do gráfico de barras para o PDF (sem rotação) */}
                {(() => {
                  const maxVal = Math.max(...results.map(r => r.netTotal - params.principal));
                  const chartHeight = 250;
                  const chartWidth = 800;
                  const barWidth = 60;
                  const gap = (chartWidth - (results.length * barWidth)) / (results.length + 1);

                  return (
                    <svg width={chartWidth} height={chartHeight + 40} viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`}>
                      {results.map((r, i) => {
                        const val = r.netTotal - params.principal;
                        const height = (val / maxVal) * (chartHeight - 60);
                        const x = gap + i * (barWidth + gap);
                        const y = chartHeight - height - 30;

                        return (
                          <g key={i}>
                            <rect
                              x={x}
                              y={y}
                              width={barWidth}
                              height={height}
                              fill={r.isUserFund ? '#10b981' : '#06b6d4'}
                              rx={4}
                            />
                            <text
                              x={x + barWidth / 2}
                              y={y - 10}
                              textAnchor="middle"
                              fill="#e2e8f0"
                              fontSize="12"
                              fontWeight="bold"
                            >
                              {val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                            </text>
                            {/* Nome do Fundo - Horizontal e Quebrado se necessário */}
                            <foreignObject x={x - 10} y={chartHeight - 20} width={barWidth + 20} height={50}>
                              <div style={{
                                fontSize: '10px',
                                color: '#94a3b8',
                                textAlign: 'center',
                                lineHeight: '1.1',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical'
                              }}>
                                {r.name}
                              </div>
                            </foreignObject>
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* --- PÁGINA 2: GRÁFICO EVOLUÇÃO, TABELA, DISCLAIMER --- */}
          <div ref={reportChartsRef} style={{ padding: '40px', paddingTop: '20px' }}>

            {/* Gráfico de Evolução */}
            <div style={{ marginBottom: '30px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '15px', borderLeft: '3px solid #10b981', paddingLeft: '10px' }}>
                Evolução Patrimonial
              </h2>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {renderChart()}
              </div>
            </div>

            {/* Tabela */}
            <div style={{ marginBottom: '30px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '15px', borderLeft: '3px solid #10b981', paddingLeft: '10px' }}>
                Detalhamento
              </h2>
              <div style={{
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #334155'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#94a3b8' }}>Investimento</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>CDI Ref.</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>% CDI</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>Taxa a.a. (Líq)</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>Total Bruto</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>IR</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>Total Líquido</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>Rentab.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((res, idx) => (
                      <tr key={res.name} style={{
                        borderBottom: '1px solid #334155',
                        backgroundColor: idx % 2 === 0 ? 'rgba(30, 41, 59, 0.3)' : 'transparent'
                      }}>
                        <td style={{ padding: '8px', fontWeight: '600', color: res.isUserFund ? '#10b981' : '#e2e8f0' }}>
                          {res.name}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>
                          {params.cdiAnnual.toFixed(2)}%
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#cbd5e1' }}>
                          {res.monthlyReturnPercentOfCDI.toFixed(0)}%
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#cbd5e1' }}>
                          {res.annualRateNet.toFixed(2)}%
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#cbd5e1' }}>
                          {res.grossTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444' }}>
                          {res.taxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>
                          {res.netTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#10b981' }}>
                          {res.netReturnPercent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Disclaimer Compacto */}
            <div style={{
              padding: '15px',
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              borderTop: '1px solid #334155',
              borderRadius: '8px'
            }}>
              <h4 style={{ fontSize: '10px', fontWeight: 'bold', color: '#f59e0b', marginBottom: '5px', marginTop: 0 }}>
                ⚠️ AVISOS IMPORTANTES
              </h4>
              <p style={{ fontSize: '8px', color: '#94a3b8', lineHeight: '1.3', margin: 0, textAlign: 'justify' }}>
                Este simulador tem caráter estritamente educacional. Os resultados são estimativas baseadas nos parâmetros informados e condições de mercado atuais, não garantindo rentabilidade futura. As alíquotas de IR seguem a tabela regressiva vigente. O cálculo não considera custos operacionais (corretagem/custódia). Investimentos em renda variável ou atrelados à inflação possuem riscos. FGC cobre até R$ 250.000/CPF/Instituição. Consulte um profissional certificado antes de investir.
              </p>
              <div style={{ marginTop: '10px', textAlign: 'center' }}>
                <p style={{ fontSize: '8px', color: '#64748b', margin: 0 }}>
                  ComparaInvest © {new Date().getFullYear()}
                </p>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* PDF Modal */}
      {showPdfModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#e2e8f0' }}>
              📄 Gerar Relatório PDF
            </h2>
            <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px' }}>
              Selecione o que deseja incluir no relatório:
            </p>

            <div style={{ marginBottom: '24px' }}>
              {[
                { key: 'includeCards', label: '📊 Cards de Comparação' },
                { key: 'includeChart', label: '📈 Gráfico de Evolução' },
                { key: 'includeTable', label: '📋 Tabela Detalhada' }
              ].map(({ key, label }) => (
                <label
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: pdfOptions[key as keyof typeof pdfOptions] ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.5)',
                    border: `2px solid ${pdfOptions[key as keyof typeof pdfOptions] ? '#10b981' : '#334155'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={pdfOptions[key as keyof typeof pdfOptions]}
                    onChange={(e) => setPdfOptions({ ...pdfOptions, [key]: e.target.checked })}
                    style={{ marginRight: '12px', width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '14px', color: '#e2e8f0', fontWeight: '500' }}>{label}</span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowPdfModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#334155',
                  color: '#e2e8f0',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#475569'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#334155'}
              >
                Cancelar
              </button>
              <button
                onClick={generatePDF}
                disabled={generatingPdf || (!pdfOptions.includeCards && !pdfOptions.includeChart && !pdfOptions.includeTable)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: generatingPdf ? '#64748b' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: generatingPdf ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  opacity: (!pdfOptions.includeCards && !pdfOptions.includeChart && !pdfOptions.includeTable) ? 0.5 : 1
                }}
                onMouseEnter={(e) => !generatingPdf && (e.currentTarget.style.backgroundColor = '#2563eb')}
                onMouseLeave={(e) => !generatingPdf && (e.currentTarget.style.backgroundColor = '#3b82f6')}
              >
                {generatingPdf ? '⏳ Gerando...' : '✓ Gerar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
