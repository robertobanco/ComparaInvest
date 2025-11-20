export type InvestmentType = 'fund' | 'cdb' | 'lci' | 'poupanca';

export interface SimulationParams {
    principal: number;
    months: number;
    cdiAnnual: number;
    fundRateMonthly: number;
    fundPayoutMonthly: boolean;
}

export interface SimulationResult {
    type: InvestmentType;
    name: string;
    grossTotal: number;
    taxAmount: number;
    netTotal: number;
    netReturnPercent: number;
}

const annualToMonthly = (annualRate: number) => Math.pow(1 + annualRate / 100, 1 / 12) - 1;

const getTaxRate = (days: number): number => {
    if (days <= 180) return 0.225;
    if (days <= 360) return 0.20;
    if (days <= 720) return 0.175;
    return 0.15;
};

export const calculateSimulations = (params: SimulationParams): SimulationResult[] => {
    const { principal, months, cdiAnnual, fundRateMonthly, fundPayoutMonthly } = params;
    const days = months * 30;
    const taxRate = getTaxRate(days);
    const cdiMonthly = annualToMonthly(cdiAnnual);

    const results: SimulationResult[] = [];

    // 1. Seu Fundo
    let fundGross = 0;
    if (fundPayoutMonthly) {
        // Juros Simples: J = P * i * n
        const monthlyProfit = principal * (fundRateMonthly / 100);
        const totalProfit = monthlyProfit * months;
        fundGross = principal + totalProfit;
    } else {
        // Juros Compostos: M = P * (1 + i)^n
        fundGross = principal * Math.pow(1 + fundRateMonthly / 100, months);
    }

    const fundProfit = fundGross - principal;
    const fundTax = fundProfit * taxRate;

    results.push({
        type: 'fund',
        name: `Seu Fundo (${fundRateMonthly.toFixed(1)}% a.m.)`,
        grossTotal: fundGross,
        taxAmount: fundTax,
        netTotal: fundGross - fundTax,
        netReturnPercent: ((fundGross - fundTax - principal) / principal) * 100,
    });

    // 2. CDB 110% CDI
    const cdbRate = 1.10;
    const cdbMonthly = cdiMonthly * cdbRate;
    const cdbGross = principal * Math.pow(1 + cdbMonthly, months);
    const cdbProfit = cdbGross - principal;
    const cdbTax = cdbProfit * taxRate;

    results.push({
        type: 'cdb',
        name: 'CDB 110% CDI',
        grossTotal: cdbGross,
        taxAmount: cdbTax,
        netTotal: cdbGross - cdbTax,
        netReturnPercent: ((cdbGross - cdbTax - principal) / principal) * 100,
    });

    // 3. LCI 90% CDI (Isento)
    const lciRate = 0.90;
    const lciMonthly = cdiMonthly * lciRate;
    const lciGross = principal * Math.pow(1 + lciMonthly, months);

    results.push({
        type: 'lci',
        name: 'LCI/LCA 90% CDI',
        grossTotal: lciGross,
        taxAmount: 0,
        netTotal: lciGross,
        netReturnPercent: ((lciGross - principal) / principal) * 100,
    });

    // 4. Poupança
    const poupancaMonthly = 0.005 + 0.0017; // 0.5% + TR
    const poupancaGross = principal * Math.pow(1 + poupancaMonthly, months);

    results.push({
        type: 'poupanca',
        name: 'Poupança',
        grossTotal: poupancaGross,
        taxAmount: 0,
        netTotal: poupancaGross,
        netReturnPercent: ((poupancaGross - principal) / principal) * 100,
    });

    return results.sort((a, b) => b.netTotal - a.netTotal);
};
