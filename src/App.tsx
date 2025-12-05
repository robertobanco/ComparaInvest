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
    name: `${fundName} ${(fundMonthlyRate * 100).toFixed(2)}% PRÉ`,
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
  const poupancaAnnualGross = monthlyToAnnualCompound(poupancaMonthly);
  const poupancaGrossUp = calculateGrossUp(calculatePercentOfCDI(poupancaAnnualGross));

  let poupancaGross: number;
  let poupancaEvolution: { month: number; value: number }[];
  let poupancaMonthlyPayoutGross: number;
  let poupancaMonthlyPayoutNet: number;
  let poupancaMonthlyDetails: MonthlyDetail[] = [];
  if (params.globalPayoutMonthly) {
    const poupancaPayoutResult = calculateWithMonthlyPayout(poupancaMonthly, false);
    poupancaGross = poupancaPayoutResult.grossTotal;
    poupancaEvolution = poupancaPayoutResult.evolution;
    poupancaMonthlyPayoutGross = poupancaPayoutResult.monthlyPayoutGross;
    poupancaMonthlyPayoutNet = poupancaPayoutResult.monthlyPayoutGross; // Sem IR
    poupancaMonthlyDetails = poupancaPayoutResult.details;
  } else {
    poupancaGross = principal * Math.pow(1 + poupancaMonthly, months);
    poupancaEvolution = calculateCompoundEvolution(poupancaMonthly, false);
    poupancaMonthlyPayoutGross = 0;
    poupancaMonthlyPayoutNet = 0;
    poupancaMonthlyDetails = [];
  }

  results.push({
    type: 'poupanca',
    name: 'Poupança',
    grossTotal: poupancaGross,
    taxAmount: 0,
    taxRate: 0,
    netTotal: poupancaGross,
    netReturnPercent: ((poupancaGross - principal) / principal) * 100,
    monthlyReturnPercentOfCDI: calculatePercentOfCDI(poupancaAnnualGross),
    monthlyPayoutGross: poupancaMonthlyPayoutGross,
    monthlyPayoutNet: poupancaMonthlyPayoutNet,
    monthlyRateGross: poupancaMonthly * 100,
    monthlyRateNet: poupancaMonthly * 100,
    annualRateGross: poupancaAnnualGross,
    annualRateNet: poupancaAnnualGross,
    grossUp: poupancaGrossUp,
    isUserFund: false,
    monthlyDetails: poupancaMonthlyDetails,
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
    comparisonFund12MonthReturn: 15.0,
    globalPayoutMonthly: true,
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

  // --- THEME SYSTEM ---
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  const themeColors = {
    bg: theme === 'dark' ? '#020617' : '#f8fafc',
    bgGradient: theme === 'dark' ? 'radial-gradient(circle at 50% 0%, #1e293b 0%, #020617 100%)' : 'radial-gradient(circle at 50% 0%, #e2e8f0 0%, #f8fafc 100%)',
    headerBg: theme === 'dark' ? 'rgba(2, 6, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    cardBg: theme === 'dark' ? '#1e293b' : '#ffffff',
    cardBgTransparent: theme === 'dark' ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.8)',
    border: theme === 'dark' ? '#1e293b' : '#e2e8f0',
    borderStrong: theme === 'dark' ? '#334155' : '#cbd5e1',
    text: theme === 'dark' ? '#e2e8f0' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#475569',
    textMuted: theme === 'dark' ? '#64748b' : '#94a3b8',
    accent: theme === 'dark' ? '#10b981' : '#059669',
    accentBg: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)',
    inputBg: theme === 'dark' ? '#020617' : '#f1f5f9',
    tableHeaderBg: theme === 'dark' ? '#0f172a' : '#f8fafc',
    tableRowEven: theme === 'dark' ? 'rgba(30, 41, 59, 0.3)' : 'rgba(241, 245, 249, 0.8)',
    chartGrid: theme === 'dark' ? '#334155' : '#cbd5e1',
    chartText: theme === 'dark' ? '#94a3b8' : '#64748b',
    chartTooltipBg: theme === 'dark' ? '#1e293b' : '#ffffff',
    shadow: theme === 'dark' ? '0 4px 6px -1px rgba(0, 0, 0, 0.3)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    cardShadow: theme === 'dark' ? 'none' : '0 2px 4px rgba(0,0,0,0.05)',
    pdfBg: theme === 'dark' ? '#020617' : '#ffffff',
    pdfCardBg: theme === 'dark' ? 'rgba(15, 23, 42, 0.5)' : '#f9fafb',
    pdfCardBorder: theme === 'dark' ? '#1e293b' : '#9ca3af',
    pdfTextSecondary: theme === 'dark' ? '#94a3b8' : '#374151',
  };
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const cardsRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const [loadingRates, setLoadingRates] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [ratesSource, setRatesSource] = useState<'api' | 'manual'>('api');
  const [monthlyTablePage, setMonthlyTablePage] = useState(0);
  const [monthsPerPage, setMonthsPerPage] = useState(12); // Padrão: 12 meses por página

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
          setRatesSource('api');
        } else if (!cdiUpdated && !ipcaUpdated) {
          setRatesError('Não foi possível obter dados recentes do BCB. Usando valores padrão.');
        } else {
          setRatesSource('api'); // Pelo menos um atualizou
        }
      } else {
        setRatesError('Erro ao conectar com API do Banco Central. Usando valores padrão.');
      }
    } catch (error) {
      console.error('Erro ao buscar taxas:', error);
      setRatesError('Erro ao buscar taxas online. Usando valores padrão.');
    } finally {
      setLoadingRates(false);
    }
  };

  // Buscar taxas do Banco Central ao iniciar
  useEffect(() => {
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
  const renderBarChart = (customWidth?: number, customHeight?: number) => {
    if (results.length === 0) return null;

    const width = customWidth || 900;
    const height = customHeight || 400;
    const padding = { top: 80, right: 40, bottom: 120, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxValue = Math.max(...results.map(r => r.netTotal - params.principal));
    const barWidth = chartWidth / results.length - 10;

    return (
      <div style={{ marginBottom: '40px' }}>
        <svg width={width} height={height} style={{
          background: themeColors.bgGradient,
          borderRadius: '16px',
          boxShadow: themeColors.shadow
        }}>
          {/* Title */}
          <text x={width / 2} y={30} fill={themeColors.text} fontSize="18" fontWeight="bold" textAnchor="middle">
            📊 Rendimento Líquido por Investimento
          </text>

          {/* Subtitle with parameters */}
          <text x={width / 2} y={50} fill={themeColors.textSecondary} fontSize="11" textAnchor="middle">
            Prazo {params.months} meses | IR {getTaxRate(params.months * 30) * 100}% | CDI {params.cdiAnnual.toFixed(1)}% a.a. | Aporte {params.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })}
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
                  stroke={themeColors.chartGrid}
                  strokeWidth="1"
                  strokeDasharray="4,4"
                  opacity="0.5"
                />
                <text x={padding.left - 10} y={y + 4} fill={themeColors.chartText} fontSize="11" textAnchor="end" fontWeight="500">
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
                  fill={themeColors.text}
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
                    color: themeColors.chartText,
                    fontSize: '10px',
                    fontWeight: result.isUserFund ? 'bold' : 'normal',
                    textAlign: 'center',
                    lineHeight: '1.2',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {result.name}
                    {(result.type === 'lci' || result.type === 'poupanca') && (
                      <span style={{ display: 'block', fontSize: '9px', color: 'inherit', marginTop: '2px', fontWeight: 'normal', opacity: 0.8 }}>
                        Gross-up: {result.grossUp.toFixed(1)}%
                      </span>
                    )}
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
  const renderChart = (customWidth?: number, customHeight?: number) => {
    if (results.length === 0) return null;

    const width = customWidth || 900;
    const height = customHeight || 450;
    const padding = { top: 60, right: 20, bottom: 80, left: 80 };
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
          background: themeColors.bgGradient,
          borderRadius: '16px',
          boxShadow: themeColors.shadow
        }}>
          {/* Gradient definitions */}
          <defs>
            <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: theme === 'dark' ? '#1e293b' : '#e2e8f0', stopOpacity: 0.8 }} />
              <stop offset="100%" style={{ stopColor: theme === 'dark' ? '#0f172a' : '#f8fafc', stopOpacity: 0.3 }} />
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
          <text x={width / 2} y={25} fill={themeColors.text} fontSize="18" fontWeight="bold" textAnchor="middle">
            📈 Evolução do Patrimônio
          </text>
          {/* Subtitle with parameters */}
          <text x={width / 2} y={45} fill={themeColors.textSecondary} fontSize="11" textAnchor="middle">
            Prazo {params.months} meses | IR {(getTaxRate(params.months * 30) * 100).toFixed(1)}% | CDI {params.cdiAnnual.toFixed(1)}% a.a. | Aporte {params.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })}
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
      backgroundColor: themeColors.bg,
      backgroundImage: themeColors.bgGradient,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      color: themeColors.text
    }}>
      {/* HEADER FIXO */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: themeColors.headerBg,
        backdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${themeColors.border}`,
        padding: '16px 20px',
        boxShadow: themeColors.shadow
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
                  letterSpacing: '-0.03em',
                  color: themeColors.text
                }}>
                  ComparaInvest
                </h1>
                <p style={{ color: themeColors.textMuted, fontSize: '11px', margin: '2px 0 0 0' }}>
                  Análise completa com IR regressivo e gross-up
                </p>
              </div>
            </div>

            {/* View Toggle */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Theme Toggle */}
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                style={{
                  padding: '8px',
                  backgroundColor: themeColors.cardBg,
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: themeColors.text
                }}
                title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>

              <div style={{ display: 'flex', gap: '8px', backgroundColor: themeColors.cardBg, padding: '4px', borderRadius: '8px', border: `1px solid ${themeColors.border}` }}>
                {(['cards', 'chart', 'table'] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => setActiveView(view)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: activeView === view ? themeColors.accent : 'transparent',
                      color: activeView === view ? (theme === 'dark' ? '#020617' : 'white') : themeColors.textSecondary,
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingTop: '100px' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px' }}>
            {/* Controls */}
            <div>
              <div style={{
                backgroundColor: themeColors.cardBgTransparent,
                border: `1px solid ${themeColors.border}`,
                borderRadius: '10px',
                padding: '14px'
              }}>
                <h2 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: themeColors.accent }}>
                  Seu Fundo
                </h2>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: themeColors.textSecondary, marginBottom: '4px' }}>
                    Nome
                  </label>
                  <input
                    type="text"
                    value={params.fundName}
                    onChange={(e) => setParams({ ...params, fundName: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: themeColors.inputBg,
                      border: `1px solid ${themeColors.border}`,
                      borderRadius: '5px',
                      padding: '6px',
                      color: themeColors.text,
                      fontSize: '12px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: themeColors.textSecondary }}>Taxa Mensal</span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: themeColors.accent }}>
                      {params.fundRateMonthly.toFixed(1)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={params.fundRateMonthly}
                    onChange={(e) => setParams({ ...params, fundRateMonthly: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: themeColors.accent }}
                  />
                </div>

                <div style={{ borderTop: `1px solid ${themeColors.border}`, paddingTop: '12px', marginTop: '12px' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: themeColors.text }}>
                    Parâmetros
                  </h2>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: themeColors.textSecondary, marginBottom: '3px' }}>
                        Aporte (R$)
                      </label>
                      <input
                        type="text"
                        value={params.principal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '');
                          const numberValue = Number(value) / 100;
                          setParams({ ...params, principal: numberValue });
                        }}
                        style={{
                          width: '100%',
                          backgroundColor: themeColors.inputBg,
                          border: `1px solid ${themeColors.border}`,
                          borderRadius: '5px',
                          padding: '5px',
                          color: themeColors.text,
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: themeColors.textSecondary, marginBottom: '3px' }}>
                        Meses
                      </label>
                      <input
                        type="number"
                        value={params.months}
                        onChange={(e) => setParams({ ...params, months: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: themeColors.inputBg,
                          border: `1px solid ${themeColors.border}`,
                          borderRadius: '5px',
                          padding: '5px',
                          color: themeColors.text,
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: themeColors.textSecondary, marginBottom: '3px' }}>
                        CDI (% a.a.)
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        value={params.cdiAnnual}
                        onChange={(e) => {
                          setParams({ ...params, cdiAnnual: Number(e.target.value) });
                          setRatesSource('manual');
                        }}
                        style={{
                          width: '100%',
                          backgroundColor: themeColors.inputBg,
                          border: `1px solid ${themeColors.border}`,
                          borderRadius: '5px',
                          padding: '5px',
                          color: themeColors.text,
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: themeColors.textSecondary, marginBottom: '3px' }}>
                        CDB (% CDI)
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        value={params.cdbPercentOfCDI}
                        onChange={(e) => setParams({ ...params, cdbPercentOfCDI: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: themeColors.inputBg,
                          border: `1px solid ${themeColors.border}`,
                          borderRadius: '5px',
                          padding: '5px',
                          color: themeColors.text,
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: themeColors.textSecondary, marginBottom: '3px' }}>
                        LCI (% CDI)
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        value={params.lciPercentOfCDI}
                        onChange={(e) => setParams({ ...params, lciPercentOfCDI: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: themeColors.inputBg,
                          border: `1px solid ${themeColors.border}`,
                          borderRadius: '5px',
                          padding: '5px',
                          color: themeColors.text,
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: themeColors.textSecondary, marginBottom: '3px' }}>
                        Pré (% a.a.)
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        value={params.preFixedAnnual}
                        onChange={(e) => setParams({ ...params, preFixedAnnual: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: themeColors.inputBg,
                          border: `1px solid ${themeColors.border}`,
                          borderRadius: '5px',
                          padding: '5px',
                          color: themeColors.text,
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: themeColors.textSecondary, marginBottom: '3px' }}>
                        IPCA (% a.a.)
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        value={params.ipcaAnnual}
                        onChange={(e) => {
                          setParams({ ...params, ipcaAnnual: Number(e.target.value) });
                          setRatesSource('manual');
                        }}
                        style={{
                          width: '100%',
                          backgroundColor: themeColors.inputBg,
                          border: `1px solid ${themeColors.border}`,
                          borderRadius: '5px',
                          padding: '5px',
                          color: themeColors.text,
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
                        step={0.1}
                        value={params.ipcaPlusAnnual}
                        onChange={(e) => setParams({ ...params, ipcaPlusAnnual: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: themeColors.inputBg,
                          border: `1px solid ${themeColors.border}`,
                          borderRadius: '5px',
                          padding: '5px',
                          color: themeColors.text,
                          fontSize: '11px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>
                      Fundos (Tx ult 12m)
                    </label>
                    <input
                      type="number"
                      step={0.1}
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
                    backgroundColor: themeColors.inputBg,
                    padding: '8px',
                    borderRadius: '5px',
                    border: `1px solid ${themeColors.border}`
                  }}>
                    <span style={{ fontSize: '11px', color: themeColors.textSecondary }}>Pagamento Mensal</span>
                    <button
                      onClick={() => setParams({ ...params, globalPayoutMonthly: !params.globalPayoutMonthly })}
                      style={{
                        width: '40px',
                        height: '20px',
                        borderRadius: '10px',
                        backgroundColor: params.globalPayoutMonthly ? themeColors.accent : '#475569',
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
                  <p style={{ fontSize: '9px', color: themeColors.textMuted, marginTop: '4px', lineHeight: '1.2' }}>
                    {params.globalPayoutMonthly
                      ? "Juros Simples - IR regressivo"
                      : "Juros Compostos - IR no resgate"}
                  </p>
                </div>

                {/* Status das Taxas - Interativo */}
                <div
                  onClick={fetchEconomicRates}
                  style={{
                    marginTop: 'auto',
                    padding: '12px',
                    backgroundColor: ratesSource === 'api' ? themeColors.accentBg : 'rgba(245, 158, 11, 0.1)',
                    borderTop: `1px solid ${themeColors.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = ratesSource === 'api' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ratesSource === 'api' ? themeColors.accentBg : 'rgba(245, 158, 11, 0.1)'}
                  title={ratesError || "Clique para atualizar as taxas do Banco Central"}
                >
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: ratesSource === 'api' ? themeColors.accent : '#f59e0b',
                    boxShadow: ratesSource === 'api' ? `0 0 8px ${themeColors.accent}` : 'none'
                  }} />
                  <div style={{ fontSize: '10px', color: ratesSource === 'api' ? themeColors.accent : '#f59e0b', flex: 1 }}>
                    {loadingRates ? 'Atualizando taxas...' : (
                      ratesSource === 'api'
                        ? 'Taxas CDI e IPCA atualizadas (BCB)'
                        : 'Taxas manuais/padrão (Clique p/ atualizar)'
                    )}
                  </div>
                  {!loadingRates && (
                    <div style={{ fontSize: '10px', color: themeColors.textMuted }}>↻</div>
                  )}
                </div>          </div>
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
                          border: res.isUserFund ? `2px solid ${themeColors.accent}` : `1px solid ${themeColors.border}`,
                          backgroundColor: res.isUserFund ? themeColors.accentBg : themeColors.cardBgTransparent,
                          transition: 'transform 0.2s',
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: themeColors.cardShadow
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
                          fontSize: '15px',
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
                          fontSize: '11px',
                          color: themeColors.textMuted,
                          marginBottom: '10px',
                          paddingBottom: '8px',
                          borderBottom: `1px solid ${themeColors.border}`
                        }}>
                          {params.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })} • {params.months} meses
                        </div>

                        <div style={{ fontSize: '11px', color: themeColors.textMuted, marginBottom: '2px' }}>
                          {res.monthlyReturnPercentOfCDI.toFixed(1)}% CDI
                          {res.grossUp > 0 && ` • Gross-up: ${res.grossUp.toFixed(1)}%`}
                        </div>

                        <div style={{ fontSize: '11px', color: themeColors.textSecondary, marginBottom: '8px', lineHeight: '1.3' }}>
                          <div>
                            <span style={{ color: themeColors.textMuted }}>Mensal:</span>{' '}
                            <span style={{ color: themeColors.textSecondary }}>{res.monthlyRateGross.toFixed(3)}% <span style={{ fontSize: '10px' }}>bruto</span></span>
                            {' / '}
                            <span style={{ color: themeColors.accent }}>{res.monthlyRateNet.toFixed(3)}% <span style={{ fontSize: '10px' }}>líq</span></span>
                          </div>
                          <div>
                            <span style={{ color: themeColors.textMuted }}>Anual:</span>{' '}
                            <span style={{ color: themeColors.textSecondary }}>{res.annualRateGross.toFixed(2)}% <span style={{ fontSize: '10px' }}>bruto</span></span>
                            {' / '}
                            <span style={{ color: themeColors.accent }}>{res.annualRateNet.toFixed(2)}% <span style={{ fontSize: '10px' }}>líq</span></span>
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
                            <div style={{ fontSize: '10px', color: themeColors.textMuted, marginBottom: '1px' }}>Crédito Mensal</div>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#10b981' }}>
                              {res.monthlyPayoutGross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} bruto
                            </div>
                            <div style={{ fontSize: '10px', color: '#10b981' }}>
                              {res.monthlyPayoutNet.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} líq
                            </div>
                          </div>
                        )}

                        <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span style={{ color: themeColors.textMuted }}>Bruto</span>
                          <span style={{ fontWeight: '600', color: themeColors.text }}>
                            {res.grossTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>

                        <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span style={{ color: themeColors.textMuted }}>
                            IR {res.taxRate > 0 ? `${res.taxRate.toFixed(1)}%` : ''}
                          </span>
                          <span style={{ fontWeight: '500', color: '#f87171' }}>
                            - {res.taxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>

                        <div style={{
                          paddingTop: '8px',
                          borderTop: `1px solid ${themeColors.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-end',
                          marginBottom: '8px'
                        }}>
                          <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '500' }}>Líquido</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: themeColors.text }}>
                              {res.netTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: '500' }}>
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
                              backgroundColor: themeColors.cardBg,
                              border: `1px solid ${themeColors.borderStrong}`,
                              borderRadius: '5px',
                              color: themeColors.textSecondary,
                              fontSize: '10px',
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
                            backgroundColor: themeColors.bg,
                            borderRadius: '5px',
                            padding: '6px'
                          }}>
                            <table style={{ width: '100%', fontSize: '8px', color: themeColors.textSecondary }}>
                              <thead>
                                <tr style={{ borderBottom: `1px solid ${themeColors.borderStrong}` }}>
                                  <th style={{ textAlign: 'left', padding: '3px' }}>Mês</th>
                                  <th style={{ textAlign: 'right', padding: '3px' }}>Bruto</th>
                                  <th style={{ textAlign: 'right', padding: '3px' }}>IR%</th>
                                  <th style={{ textAlign: 'right', padding: '3px' }}>Líq.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {res.monthlyDetails.map((detail) => (
                                  <tr key={detail.month} style={{ borderBottom: `1px solid ${themeColors.border}` }}>
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
                            <div style={{ fontSize: '10px', color: themeColors.textMuted, marginBottom: '2px' }}>
                              vs {userFund?.name}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={{ fontSize: '14px', fontWeight: 'bold', color: diff.value > 0 ? '#10b981' : '#ef4444' }}>
                                {diff.value > 0 ? '+' : ''}{diff.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                              <span style={{ fontSize: '11px', color: diff.value > 0 ? '#10b981' : '#ef4444' }}>
                                {' '}({diff.percent > 0 ? '+' : ''}{diff.percent.toFixed(2)}%)
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
                  backgroundColor: themeColors.cardBgTransparent,
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '10px',
                  padding: '20px',
                  overflowX: 'auto'
                }}>
                  <div style={{ marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', color: themeColors.text, margin: 0, marginBottom: '8px' }}>
                      Comparação Detalhada
                    </h2>
                    <div style={{
                      fontSize: '11px',
                      color: themeColors.textMuted,
                      padding: '8px 12px',
                      backgroundColor: themeColors.bg,
                      borderRadius: '6px',
                      border: `1px solid ${themeColors.borderStrong}`
                    }}>
                      Prazo {params.months} meses | IR {(getTaxRate(params.months * 30) * 100).toFixed(1)}% | CDI {params.cdiAnnual.toFixed(2)}% a.a. | Aporte {params.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })}
                    </div>
                  </div>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${themeColors.borderStrong}` }}>
                        <th style={{ textAlign: 'left', padding: '12px', color: themeColors.textSecondary }}>Investimento</th>
                        <th style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>
                          % CDI
                        </th>
                        <th style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>
                          Taxa Mensal
                          <div style={{ fontSize: '9px', color: themeColors.textMuted, fontWeight: 'normal' }}>bruto / líquido</div>
                        </th>
                        <th style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>
                          Taxa Anual
                          <div style={{ fontSize: '9px', color: themeColors.textMuted, fontWeight: 'normal' }}>bruto / líquido</div>
                        </th>
                        <th style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>Total Bruto</th>
                        <th style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>IR</th>
                        <th style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>Total Líquido</th>
                        <th style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>Rentabilidade</th>
                        <th style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>vs {userFund?.name}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((res) => {
                        const diff = getDifferential(res);
                        return (
                          <tr
                            key={res.name}
                            style={{
                              borderBottom: `1px solid ${themeColors.border}`,
                              backgroundColor: res.isUserFund ? themeColors.accentBg : 'transparent'
                            }}
                          >
                            <td style={{ padding: '12px', color: themeColors.text, fontWeight: res.isUserFund ? 'bold' : 'normal' }}>
                              {res.name}
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: '#10b981', fontWeight: '600' }}>
                              {res.monthlyReturnPercentOfCDI.toFixed(1)}%
                              {(res.type === 'lci' || res.type === 'poupanca') && (
                                <span style={{ color: 'inherit', fontWeight: 'normal', opacity: 0.8 }}>
                                  {' | Gross-up: '}{res.grossUp.toFixed(1)}%
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>
                              {res.monthlyRateGross.toFixed(3)}% / {res.monthlyRateNet.toFixed(3)}%
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>
                              {res.annualRateGross.toFixed(2)}% / {res.annualRateNet.toFixed(2)}%
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px', color: themeColors.textSecondary }}>
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
                            <td style={{ textAlign: 'right', padding: '12px', color: diff ? (diff.value > 0 ? '#10b981' : '#ef4444') : themeColors.textMuted }}>
                              {diff ? `${diff.value > 0 ? '+' : ''}${diff.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Nova Tabela: Comparação Mensal com Paginação */}
              {activeView === 'table' && results.length > 0 && results[0].monthlyDetails.length > 0 && (
                <div style={{
                  backgroundColor: themeColors.cardBgTransparent,
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '10px',
                  padding: '20px',
                  marginTop: '20px',
                  overflowX: 'auto'
                }}>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h2 style={{ fontSize: '18px', fontWeight: '600', color: themeColors.text, margin: 0 }}>
                        📅 Evolução Mensal Comparada
                      </h2>
                      <button
                        onClick={() => {
                          // Função de exportação para Excel
                          const exportToExcel = () => {
                            // Criar CSV
                            let csv = 'Mês,' + results.map(r => r.name).join(',') + '\n';

                            for (let month = 0; month < params.months; month++) {
                              const row = [`Mês ${month + 1}`];
                              results.forEach(r => {
                                if (r.monthlyDetails[month]) {
                                  row.push(r.monthlyDetails[month].netProfit.toFixed(2).replace('.', ','));
                                } else {
                                  row.push('');
                                }
                              });
                              csv += row.join(',') + '\n';
                            }

                            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                            const link = document.createElement('a');
                            if (link.download !== undefined) {
                              const url = URL.createObjectURL(blob);
                              link.setAttribute('href', url);
                              link.setAttribute('download', 'evolucao_mensal.csv');
                              link.style.visibility = 'hidden';
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }
                          };
                          exportToExcel();
                        }}
                        style={{
                          backgroundColor: themeColors.accent,
                          color: '#020617',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'none',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                      >
                        📊 Exportar Excel
                      </button>
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: themeColors.textMuted,
                      padding: '8px 12px',
                      backgroundColor: themeColors.bg,
                      borderRadius: '6px',
                      border: `1px solid ${themeColors.borderStrong}`
                    }}>
                      Prazo {params.months} meses | IR {(getTaxRate(params.months * 30) * 100).toFixed(1)}% | CDI {params.cdiAnnual.toFixed(2)}% a.a. | Aporte {params.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })}
                    </div>
                  </div>

                  {/* Tabela Mensal */}
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${themeColors.borderStrong}` }}>
                        <th style={{ textAlign: 'left', padding: '10px', color: themeColors.textSecondary, position: 'sticky', left: 0, backgroundColor: themeColors.tableHeaderBg, zIndex: 10 }}>
                          Mês
                        </th>
                        {results.map((res) => (
                          <th key={res.name} style={{
                            textAlign: 'right',
                            padding: '10px',
                            color: res.isUserFund ? themeColors.accent : themeColors.textSecondary,
                            fontWeight: res.isUserFund ? 'bold' : 'normal',
                            minWidth: '120px'
                          }}>
                            <div>{res.name}</div>
                            <div style={{ fontSize: '9px', color: themeColors.textMuted, fontWeight: 'normal' }}>
                              {res.monthlyReturnPercentOfCDI.toFixed(0)}% CDI
                              {(res.type === 'lci' || res.type === 'poupanca') && (
                                <span style={{ color: 'inherit', opacity: 0.8 }}> | Gross-up: {res.grossUp.toFixed(1)}%</span>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const startMonth = monthlyTablePage * monthsPerPage;
                        const endMonth = Math.min(startMonth + monthsPerPage, params.months);
                        const monthsToShow = [];

                        for (let month = startMonth; month < endMonth; month++) {
                          monthsToShow.push(
                            <tr key={month} style={{
                              borderBottom: `1px solid ${themeColors.border}`,
                              backgroundColor: month % 2 === 0 ? themeColors.tableRowEven : 'transparent'
                            }}>
                              <td style={{
                                padding: '10px',
                                color: themeColors.text,
                                fontWeight: '600',
                                position: 'sticky',
                                left: 0,
                                backgroundColor: month % 2 === 0 ? themeColors.tableRowEven : themeColors.tableHeaderBg,
                                zIndex: 5
                              }}>
                                Mês {month + 1}
                              </td>
                              {results.map((res) => {
                                const monthData = res.monthlyDetails[month];
                                if (!monthData) return <td key={res.name}>-</td>;

                                return (
                                  <td key={res.name} style={{
                                    textAlign: 'right',
                                    padding: '10px',
                                    color: '#cbd5e1'
                                  }}>
                                    <div style={{ fontWeight: '600', color: '#10b981' }}>
                                      {monthData.accumulated.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </div>
                                    <div style={{ fontSize: '9px', color: '#64748b' }}>
                                      IR: {monthData.taxRate.toFixed(1)}%
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        }

                        return monthsToShow;
                      })()}
                    </tbody>
                  </table>

                  {/* Controles de Paginação */}
                  {params.months > monthsPerPage && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '24px',
                      marginTop: '20px',
                      paddingTop: '20px',
                      borderTop: '1px solid #1e293b'
                    }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Meses por página:</span>
                        <select
                          value={monthsPerPage}
                          onChange={(e) => {
                            setMonthsPerPage(Number(e.target.value));
                            setMonthlyTablePage(0); // Reset para primeira página
                          }}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#1e293b',
                            color: '#e2e8f0',
                            border: '1px solid #334155',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          <option value={12}>12</option>
                          <option value={24}>24</option>
                          <option value={36}>36</option>
                          <option value={48}>48</option>
                          <option value={60}>60</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button
                          onClick={() => setMonthlyTablePage(Math.max(0, monthlyTablePage - 1))}
                          disabled={monthlyTablePage === 0}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: monthlyTablePage === 0 ? '#1e293b' : '#3b82f6',
                            color: monthlyTablePage === 0 ? '#64748b' : 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: monthlyTablePage === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            transition: 'all 0.2s'
                          }}
                        >
                          ← Anterior
                        </button>

                        <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: '600' }}>
                          Meses {monthlyTablePage * monthsPerPage + 1} - {Math.min((monthlyTablePage + 1) * monthsPerPage, params.months)} de {params.months}
                        </div>

                        <button
                          onClick={() => setMonthlyTablePage(Math.min(Math.ceil(params.months / monthsPerPage) - 1, monthlyTablePage + 1))}
                          disabled={(monthlyTablePage + 1) * monthsPerPage >= params.months}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: (monthlyTablePage + 1) * monthsPerPage >= params.months ? '#1e293b' : '#3b82f6',
                            color: (monthlyTablePage + 1) * monthsPerPage >= params.months ? '#64748b' : 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: (monthlyTablePage + 1) * monthsPerPage >= params.months ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            transition: 'all 0.2s'
                          }}
                        >
                          Próxima →
                        </button>
                      </div>
                    </div>
                  )}
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
          backgroundColor: themeColors.pdfBg,
          color: themeColors.text,
          fontFamily: 'Inter, sans-serif',
          zIndex: -1
        }}>

          {/* --- PÁGINA 1: HEADER, PARÂMETROS, CARDS --- */}
          <div ref={reportHeaderRef} style={{ padding: '30px', paddingBottom: '20px', minHeight: '1100px', position: 'relative', backgroundColor: themeColors.pdfBg }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: themeColors.text, margin: 0 }}>
                  Comparador de Investimentos
                </h1>
                <p style={{ color: themeColors.textSecondary, fontSize: '12px', margin: '4px 0 0 0' }}>
                  Relatório Detalhado de Rentabilidade
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '10px', color: themeColors.textMuted, margin: 0 }}>Gerado em</p>
                <p style={{ fontSize: '12px', fontWeight: '600', color: themeColors.text, margin: 0 }}>
                  {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
                </p>
              </div>
            </div>

            {/* Parâmetros */}
            <div style={{
              backgroundColor: themeColors.pdfCardBg,
              borderRadius: '8px',
              padding: '15px',
              border: `1px solid ${themeColors.pdfCardBorder}`,
              marginBottom: '20px',
              overflow: 'hidden'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: themeColors.text, marginBottom: '10px', borderBottom: `1px solid ${themeColors.borderStrong}`, paddingBottom: '5px' }}>
                Parâmetros da Simulação
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div>
                  <p style={{ fontSize: '10px', color: themeColors.pdfTextSecondary, marginBottom: '1px' }}>Aporte Inicial</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: themeColors.accent }}>
                    {params.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: themeColors.pdfTextSecondary, marginBottom: '1px' }}>Prazo</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: themeColors.text }}>{params.months} meses</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: themeColors.pdfTextSecondary, marginBottom: '1px' }}>Taxa CDI</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: themeColors.text }}>{params.cdiAnnual.toFixed(2)}% a.a.</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: themeColors.pdfTextSecondary, marginBottom: '1px' }}>IPCA</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: themeColors.text }}>{params.ipcaAnnual.toFixed(2)}% a.a.</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: themeColors.pdfTextSecondary, marginBottom: '1px' }}>Imposto de Renda</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: themeColors.text }}>
                    {(getTaxRate(params.months * 30) * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: themeColors.pdfTextSecondary, marginBottom: '1px' }}>Pagamento Mensal</p>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: themeColors.text }}>
                    {params.globalPayoutMonthly ? 'Sim' : 'Não'}
                  </p>
                </div>
              </div>
            </div>

            {/* Cards */}
            {pdfOptions.includeCards && (
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: themeColors.text, marginBottom: '10px', borderLeft: `3px solid ${themeColors.accent}`, paddingLeft: '10px' }}>
                  Comparativo de Resultados
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {results.map((res) => {
                    const diff = getDifferential(res);
                    return (
                      <div
                        key={res.name}
                        style={{
                          position: 'relative',
                          padding: '12px',
                          borderRadius: '10px',
                          border: res.isUserFund ? `2px solid ${themeColors.accent}` : `1px solid ${themeColors.pdfCardBorder}`,
                          backgroundColor: res.isUserFund ? themeColors.accentBg : themeColors.pdfCardBg,
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                      >
                        {res.isUserFund && (
                          <div style={{
                            position: 'absolute',
                            top: '-9px',
                            left: '10px',
                            backgroundColor: themeColors.accent,
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
                          color: res.isUserFund ? themeColors.accent : themeColors.text,
                          letterSpacing: '-0.02em'
                        }}>
                          {res.name}
                        </h3>

                        {/* Aporte e Prazo */}
                        <div style={{
                          fontSize: '10px',
                          color: themeColors.pdfTextSecondary,
                          marginBottom: '10px',
                          paddingBottom: '8px',
                          borderBottom: `1px solid ${themeColors.border}`
                        }}>
                          {params.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })} • {params.months} meses
                        </div>

                        <div style={{ fontSize: '10px', color: themeColors.pdfTextSecondary, marginBottom: '2px' }}>
                          {res.monthlyReturnPercentOfCDI.toFixed(1)}% CDI
                          {res.grossUp > 0 && ` • Gross-up: ${res.grossUp.toFixed(1)}%`}
                        </div>

                        <div style={{ fontSize: '9px', color: themeColors.pdfTextSecondary, marginBottom: '8px', lineHeight: '1.3' }}>
                          <div>
                            <span style={{ color: themeColors.pdfTextSecondary }}>Mensal:</span>{' '}
                            <span style={{ color: themeColors.text }}>{res.monthlyRateGross.toFixed(3)}% <span style={{ fontSize: '8px' }}>bruto</span></span>
                            {' / '}
                            <span style={{ color: themeColors.accent }}>{res.monthlyRateNet.toFixed(3)}% <span style={{ fontSize: '8px' }}>líq</span></span>
                          </div>
                          <div>
                            <span style={{ color: themeColors.pdfTextSecondary }}>Anual:</span>{' '}
                            <span style={{ color: themeColors.text }}>{res.annualRateGross.toFixed(2)}% <span style={{ fontSize: '8px' }}>bruto</span></span>
                            {' / '}
                            <span style={{ color: themeColors.accent }}>{res.annualRateNet.toFixed(2)}% <span style={{ fontSize: '8px' }}>líq</span></span>
                          </div>
                        </div>

                        {params.globalPayoutMonthly && res.monthlyPayoutGross > 0 && (
                          <div style={{
                            backgroundColor: themeColors.accentBg,
                            padding: '6px',
                            borderRadius: '5px',
                            marginBottom: '8px',
                            border: `1px solid ${themeColors.accent}`
                          }}>
                            <div style={{ fontSize: '9px', color: themeColors.pdfTextSecondary, marginBottom: '1px' }}>Crédito Mensal</div>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: themeColors.accent }}>
                              {res.monthlyPayoutGross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} bruto
                            </div>
                            <div style={{ fontSize: '9px', color: themeColors.accent }}>
                              {res.monthlyPayoutNet.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} líq
                            </div>
                          </div>
                        )}

                        <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                          <span style={{ color: themeColors.pdfTextSecondary }}>Bruto</span>
                          <span style={{ fontWeight: '600', color: themeColors.text }}>
                            {res.grossTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>

                        <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                          <span style={{ color: themeColors.pdfTextSecondary }}>
                            IR {res.taxRate > 0 ? `${res.taxRate.toFixed(1)}%` : ''}
                          </span>
                          <span style={{ fontWeight: '500', color: '#f87171' }}>
                            - {res.taxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>

                        <div style={{
                          paddingTop: '8px',
                          borderTop: `1px solid ${themeColors.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-end',
                          marginBottom: '8px'
                        }}>
                          <span style={{ fontSize: '10px', color: themeColors.accent, fontWeight: '500' }}>Líquido</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '15px', fontWeight: 'bold', color: themeColors.text }}>
                              {res.netTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                            <div style={{ fontSize: '9px', color: themeColors.accent, fontWeight: '500' }}>
                              +{res.netReturnPercent.toFixed(2)}%
                            </div>
                          </div>
                        </div>

                        {!res.isUserFund && diff && (
                          <div style={{
                            padding: '6px 8px',
                            borderRadius: '5px',
                            marginTop: 'auto',
                            backgroundColor: diff.value > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            border: `1px solid ${diff.value > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                          }}>
                            <div style={{ fontSize: '9px', color: themeColors.pdfTextSecondary, marginBottom: '2px' }}>
                              vs {userFund?.name}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={{ fontSize: '13px', fontWeight: 'bold', color: diff.value > 0 ? themeColors.accent : '#ef4444' }}>
                                {diff.value > 0 ? '+' : ''}{diff.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                              <span style={{ fontSize: '10px', color: diff.value > 0 ? themeColors.accent : '#ef4444' }}>
                                {' '}({diff.percent > 0 ? '+' : ''}{diff.percent.toFixed(2)}%)
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          {/* --- PÁGINA 2: GRÁFICOS (BARRAS E EVOLUÇÃO), TABELA, DISCLAIMER --- */}
          <div ref={reportChartsRef} style={{ padding: '30px', paddingTop: '20px', minHeight: '1100px', position: 'relative', backgroundColor: themeColors.pdfBg }}>

            {/* Gráfico de Barras (Rendimento Líquido) */}
            {pdfOptions.includeChart && (
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: themeColors.text, marginBottom: '10px', borderLeft: `3px solid ${themeColors.accent}`, paddingLeft: '10px' }}>
                  Rendimento Líquido
                </h2>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {renderBarChart(900, 350)}
                </div>
              </div>
            )}

            {/* Gráfico de Evolução */}
            {pdfOptions.includeChart && (
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: themeColors.text, marginBottom: '10px', borderLeft: `3px solid ${themeColors.accent}`, paddingLeft: '10px' }}>
                  Evolução Patrimonial
                </h2>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {renderChart(900, 350)}
                </div>
              </div>
            )}

            {/* Tabela */}
            {pdfOptions.includeTable && (
              <div style={{ marginBottom: '30px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: themeColors.text, marginBottom: '15px', borderLeft: `3px solid ${themeColors.accent}`, paddingLeft: '10px' }}>
                  Detalhamento
                </h2>
                <div style={{
                  backgroundColor: themeColors.pdfCardBg,
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: `1px solid ${themeColors.pdfCardBorder}`
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                    <thead>
                      <tr style={{ backgroundColor: themeColors.tableHeaderBg, borderBottom: `1px solid ${themeColors.borderStrong}` }}>
                        <th style={{ padding: '8px', textAlign: 'left', color: themeColors.textSecondary }}>Investimento</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: themeColors.textSecondary }}>% CDI</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: themeColors.textSecondary }}>Taxa Mensal (Líq)</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: themeColors.textSecondary }}>Taxa Anual (Líq)</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: themeColors.textSecondary }}>Total Bruto</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: themeColors.textSecondary }}>IR</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: themeColors.textSecondary }}>Total Líquido</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: themeColors.textSecondary }}>Rentabilidade</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: themeColors.textSecondary }}>vs Seu Fundo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((res, idx) => {
                        const diff = getDifferential(res);
                        return (
                          <tr key={res.name} style={{
                            borderBottom: `1px solid ${themeColors.border}`,
                            backgroundColor: idx % 2 === 0 ? themeColors.tableRowEven : 'transparent'
                          }}>
                            <td style={{ padding: '8px', fontWeight: '600', color: res.isUserFund ? themeColors.accent : themeColors.text }}>
                              {res.name}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: themeColors.accent }}>
                              {res.monthlyReturnPercentOfCDI.toFixed(0)}%
                              {(res.type === 'lci' || res.type === 'poupanca') && (
                                <span style={{ color: themeColors.textMuted, fontWeight: 'normal', fontSize: '8px', display: 'block' }}>
                                  (Gross-up: {res.grossUp.toFixed(1)}%)
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: themeColors.text }}>
                              {res.monthlyRateNet.toFixed(3)}%
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: themeColors.text }}>
                              {res.annualRateNet.toFixed(2)}%
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: themeColors.text }}>
                              {res.grossTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444' }}>
                              {res.taxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: themeColors.accent }}>
                              {res.netTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: themeColors.accent }}>
                              +{res.netReturnPercent.toFixed(2)}%
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: diff ? (diff.value > 0 ? themeColors.accent : '#ef4444') : themeColors.textMuted }}>
                              {diff ? `${diff.value > 0 ? '+' : ''}${diff.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div></div>
            )}

            {/* Disclaimer Compacto */}
            <div style={{
              padding: '15px',
              backgroundColor: themeColors.pdfCardBg,
              borderTop: `1px solid ${themeColors.border}`,
              borderRadius: '8px',
              marginTop: 'auto'
            }}>
              <h4 style={{ fontSize: '10px', fontWeight: 'bold', color: '#f59e0b', marginBottom: '5px', marginTop: 0 }}>
                ⚠️ AVISOS IMPORTANTES
              </h4>
              <p style={{ fontSize: '8px', color: themeColors.textSecondary, lineHeight: '1.3', margin: 0, textAlign: 'justify' }}>
                Este simulador tem caráter estritamente educacional. Os resultados são estimativas baseadas nos parâmetros informados e condições de mercado atuais, não garantindo rentabilidade futura. As alíquotas de IR seguem a tabela regressiva vigente. O cálculo não considera custos operacionais (corretagem/custódia). Investimentos em renda variável ou atrelados à inflação possuem riscos. FGC cobre até R$ 250.000/CPF/Instituição. Consulte um profissional certificado antes de investir.
              </p>
              <div style={{ marginTop: '10px', textAlign: 'center' }}>
                <p style={{ fontSize: '8px', color: themeColors.textMuted, margin: 0 }}>
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
            backgroundColor: themeColors.cardBg,
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: themeColors.shadow,
            border: `1px solid ${themeColors.border}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: themeColors.text }}>
                📄 Gerar Relatório PDF
              </h2>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                style={{
                  padding: '8px 12px',
                  backgroundColor: themeColors.inputBg,
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '18px',
                  transition: 'all 0.2s'
                }}
                title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
            <p style={{ fontSize: '14px', color: themeColors.textSecondary, marginBottom: '24px' }}>
              Selecione o que deseja incluir no relatório:
            </p>

            <div style={{ marginBottom: '24px' }}>
              {[
                { key: 'includeCards', label: '📊 Cards de Comparação' },
                { key: 'includeChart', label: '📈 Gráficos (Barras e Evolução)' },
                { key: 'includeTable', label: '📋 Tabela Detalhada' }
              ].map(({ key, label }) => (
                <label
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: pdfOptions[key as keyof typeof pdfOptions] ? themeColors.accentBg : themeColors.cardBgTransparent,
                    border: `2px solid ${pdfOptions[key as keyof typeof pdfOptions] ? themeColors.accent : themeColors.border}`,
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
                  <span style={{ fontSize: '14px', color: themeColors.text, fontWeight: '500' }}>{label}</span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowPdfModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: themeColors.inputBg,
                  color: themeColors.text,
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
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
