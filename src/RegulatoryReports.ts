/**
 * REGULATORY REPORTS - PURE WAD-18 ARITHMETIC
 * 
 * SEC/CFTC/ECB regulatory reporting
 * All values in WAD-18 (18 decimal places exact)
 * Cryptographically provable audit trail
 */

import FinancialNumber, {
  generateDeterministicProof,
  DeterministicProof,
} from '../../../r3-quant/core/FinancialArithmetic';

export interface RegulatoryReport {
  reportId: string;
  reportType: 'SEC-2a7' | 'CFTC-139' | 'ECB-MRO';
  reportDate: string;
  submissionDeadline: string;
  requiresAttested: boolean;
}

export interface SECForm2a7Report extends RegulatoryReport {
  reportType: 'SEC-2a7';
  totalPortfolioValue: FinancialNumber;
  percentageWeighted: FinancialNumber; // % of portfolio
  haircutPercentage: FinancialNumber;
  adjustedValue: FinancialNumber;
  complianceStatus: 'COMPLIANT' | 'NON_COMPLIANT';
  proof: DeterministicProof;
}

export interface CFTCForm139Report extends RegulatoryReport {
  reportType: 'CFTC-139';
  initialMarginPosted: FinancialNumber;
  variationMarginPosted: FinancialNumber;
  totalMarginPosted: FinancialNumber;
  marginCallAmount: FinancialNumber;
  complianceStatus: 'COMPLIANT' | 'NON_COMPLIANT';
  proof: DeterministicProof;
}

export interface ECBMROReport extends RegulatoryReport {
  reportType: 'ECB-MRO';
  haircutedValue: FinancialNumber;
  concentrationRisk: FinancialNumber;
  liquidityAdjustment: FinancialNumber;
  finalEligibleValue: FinancialNumber;
  complianceStatus: 'COMPLIANT' | 'NON_COMPLIANT';
  proof: DeterministicProof;
}

/**
 * GENERATE SEC FORM 2a-7 REPORT - PURE WAD-18
 * Certifies fund portfolio compliance with Rule 2a-7
 */
export function generateSECForm2a7Report(
  portfolioValue: FinancialNumber,
  haircuts: Map<string, FinancialNumber>,
  reportDate: string
): SECForm2a7Report {
  let weightedHaircut = new FinancialNumber(0n);
  let totalHaircutedValue = new FinancialNumber(0n);

  for (const [_assetId, haircut] of haircuts) {
    weightedHaircut = weightedHaircut.add(haircut);
    const haircutValue = portfolioValue.multiply(haircut);
    totalHaircutedValue = totalHaircutedValue.add(haircutValue);
  }

  const avgHaircut = haircuts.size > 0
    ? weightedHaircut.divide(new FinancialNumber(haircuts.size))
    : new FinancialNumber(0n);

  const adjustedValue = portfolioValue.multiply(
    new FinancialNumber(1n).subtract(avgHaircut)
  );

  const threshold = new FinancialNumber('0.05'); // 5% threshold
  const compliant = avgHaircut.lesserOrEqual(threshold);

  const proof = generateDeterministicProof(
    {
      portfolioValue,
      avgHaircut,
      adjustedValue,
    },
    adjustedValue,
    `SEC-2a7-${reportDate}`
  );

  return {
    reportId: `SEC-2a7-${Date.now()}`,
    reportType: 'SEC-2a7',
    reportDate,
    submissionDeadline: new Date(Date.parse(reportDate) + 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    requiresAttested: true,
    totalPortfolioValue: portfolioValue,
    percentageWeighted: avgHaircut.multiply(new FinancialNumber(100n)),
    haircutPercentage: avgHaircut,
    adjustedValue,
    complianceStatus: compliant ? 'COMPLIANT' : 'NON_COMPLIANT',
    proof,
  };
}

/**
 * GENERATE CFTC FORM 139 REPORT - PURE WAD-18
 * Certifies margin posted with clearinghouse
 */
export function generateCFTCForm139Report(
  initialMargin: FinancialNumber,
  variationMargin: FinancialNumber,
  reportDate: string
): CFTCForm139Report {
  const totalMargin = initialMargin.add(variationMargin);
  const thresholdIM = new FinancialNumber('25000000'); // $25M threshold
  const needsMarginCall = initialMargin.lesserOrEqual(thresholdIM);
  const marginCallAmount = needsMarginCall
    ? thresholdIM.subtract(initialMargin)
    : new FinancialNumber(0n);

  const compliant = !needsMarginCall || marginCallAmount.getRaw() === 0n;

  const proof = generateDeterministicProof(
    {
      im: initialMargin,
      vm: variationMargin,
      total: totalMargin,
    },
    totalMargin,
    `CFTC-139-${reportDate}`
  );

  return {
    reportId: `CFTC-139-${Date.now()}`,
    reportType: 'CFTC-139',
    reportDate,
    submissionDeadline: new Date(Date.parse(reportDate) + 1 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    requiresAttested: true,
    initialMarginPosted: initialMargin,
    variationMarginPosted: variationMargin,
    totalMarginPosted: totalMargin,
    marginCallAmount,
    complianceStatus: compliant ? 'COMPLIANT' : 'NON_COMPLIANT',
    proof,
  };
}

/**
 * GENERATE ECB MAIN REFINANCING OPERATIONS (MRO) REPORT - PURE WAD-18
 * Certifies eligible collateral for ECB repo operations
 */
export function generateECBMROReport(
  unhaircutValue: FinancialNumber,
  haircuts: FinancialNumber[],
  reportDate: string
): ECBMROReport {
  let totalHaircut = new FinancialNumber(0n);
  for (const haircut of haircuts) {
    totalHaircut = totalHaircut.add(haircut);
  }

  const avgHaircut = haircuts.length > 0
    ? totalHaircut.divide(new FinancialNumber(haircuts.length))
    : new FinancialNumber(0n);

  const haircutedValue = unhaircutValue.multiply(
    new FinancialNumber(1n).subtract(avgHaircut)
  );

  // Concentration risk (if > 10% of portfolio, apply surcharge)
  const concentrationSurcharge = new FinancialNumber('0.10');
  const concentrationRisk = haircutedValue.multiply(concentrationSurcharge);

  // Liquidity adjustment (typically -2% to -5%)
  const liquidityAdjustment = haircutedValue.multiply(new FinancialNumber('0.03'));

  const finalValue = haircutedValue
    .subtract(concentrationRisk)
    .subtract(liquidityAdjustment);

  const minThreshold = unhaircutValue.multiply(new FinancialNumber('0.50')); // 50% minimum
  const compliant = finalValue.greaterOrEqual(minThreshold);

  const proof = generateDeterministicProof(
    {
      unhaircutValue,
      haircutedValue,
      finalValue,
    },
    finalValue,
    `ECB-MRO-${reportDate}`
  );

  return {
    reportId: `ECB-MRO-${Date.now()}`,
    reportType: 'ECB-MRO',
    reportDate,
    submissionDeadline: new Date(Date.parse(reportDate) + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    requiresAttested: true,
    haircutedValue,
    concentrationRisk,
    liquidityAdjustment,
    finalEligibleValue: finalValue,
    complianceStatus: compliant ? 'COMPLIANT' : 'NON_COMPLIANT',
    proof,
  };
}

export default {
  generateSECForm2a7Report,
  generateCFTCForm139Report,
  generateECBMROReport,
};
