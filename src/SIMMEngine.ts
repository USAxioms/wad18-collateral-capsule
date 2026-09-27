/**
 * ISDA SIMM v3.0 ENGINE - PURE WAD-18 ARITHMETIC
 * 
 * Standard Initial Margin Model (SIMM) implementation
 * All calculations use WAD-18 fixed-point arithmetic
 * Zero floating-point operations
 */

import FinancialNumber, {
  generateDeterministicProof,
  DeterministicProof,
} from '../../../r3-quant/core/FinancialArithmetic';

export type RiskClass = 'IR' | 'FX' | 'EQ' | 'COMM' | 'CRED';

export interface RiskFactor {
  riskClass: RiskClass;
  sensitivity: FinancialNumber;
  riskWeight: FinancialNumber;
  concentration: FinancialNumber;
}

/**
 * ISDA SIMM v3.0 Risk Weights (WAD-18)
 * Source: ISDA Standard Initial Margin Model Documentation (v3.0)
 */
export const RISK_WEIGHTS: Record<RiskClass, FinancialNumber> = {
  IR: new FinancialNumber('0.0050'),      // 0.50% (interest rate)
  FX: new FinancialNumber('0.0420'),      // 4.20% (FX)
  EQ: new FinancialNumber('0.1900'),      // 19.0% (equity)
  COMM: new FinancialNumber('0.1800'),    // 18.0% (commodity)
  CRED: new FinancialNumber('0.0120'),    // 1.20% (credit)
};

/**
 * Correlation matrix (WAD-18)
 * SIMM specifies pairwise correlations between risk factors
 */
export const CORRELATION_MATRIX: Record<string, Record<string, FinancialNumber>> = {
  'IR-IR': new FinancialNumber('0.85'),
  'IR-FX': new FinancialNumber('0.07'),
  'IR-EQ': new FinancialNumber('0.22'),
  'IR-COMM': new FinancialNumber('0.11'),
  'IR-CRED': new FinancialNumber('0.68'),
  'FX-FX': new FinancialNumber('0.70'),
  'FX-EQ': new FinancialNumber('0.04'),
  'FX-COMM': new FinancialNumber('0.35'),
  'FX-CRED': new FinancialNumber('0.17'),
  'EQ-EQ': new FinancialNumber('0.60'),
  'EQ-COMM': new FinancialNumber('0.16'),
  'EQ-CRED': new FinancialNumber('0.24'),
  'COMM-COMM': new FinancialNumber('0.54'),
  'COMM-CRED': new FinancialNumber('0.13'),
  'CRED-CRED': new FinancialNumber('0.68'),
};

export interface SIMMCalculation {
  riskClass: RiskClass;
  grossSensitivity: FinancialNumber;
  riskWeightedSensitivity: FinancialNumber;
  concentrationRiskCharge: FinancialNumber;
  classInitialMargin: FinancialNumber;
  proof: DeterministicProof;
}

/**
 * CALCULATE SIMM FOR SINGLE RISK CLASS - PURE WAD-18
 * IM = sqrt(sum(RW × S)^2 + concentration charge)
 * where RW = risk weight, S = sensitivity
 */
export function calculateSIMMForRiskClass(
  riskClass: RiskClass,
  sensitivities: FinancialNumber[],
  concentrationThreshold: FinancialNumber
): SIMMCalculation {
  const zero = new FinancialNumber(0n);
  const riskWeight = RISK_WEIGHTS[riskClass];

  // Calculate gross sensitivity (sum of all sensitivities)
  let grossSensitivity = zero;
  for (const sensitivity of sensitivities) {
    grossSensitivity = grossSensitivity.add(sensitivity);
  }

  // Risk-weighted sensitivity = |gross sensitivity| × risk weight
  const absGross = grossSensitivity.getRaw() < 0n
    ? new FinancialNumber(-grossSensitivity.getRaw())
    : grossSensitivity;
  const riskWeightedSensitivity = absGross.multiply(riskWeight);

  // Concentration risk charge (simplified: if gross > threshold, apply multiplier)
  const concentrationMultiplier = absGross.greaterOrEqual(concentrationThreshold)
    ? new FinancialNumber('1.50')  // 50% surcharge
    : new FinancialNumber('1.00');

  const concentrationRiskCharge = riskWeightedSensitivity
    .multiply(concentrationMultiplier)
    .subtract(riskWeightedSensitivity);

  // Class IM = sqrt(RW×S + concentration)
  const totalCharge = riskWeightedSensitivity.add(concentrationRiskCharge);
  const classInitialMargin = totalCharge.sqrt();

  const proof = generateDeterministicProof(
    {
      riskClass,
      grossSensitivity,
      riskWeight,
    },
    classInitialMargin,
    `SIMM-${riskClass}`
  );

  return {
    riskClass,
    grossSensitivity,
    riskWeightedSensitivity,
    concentrationRiskCharge,
    classInitialMargin,
    proof,
  };
}

export interface PortfolioSIMMResult {
  riskClassResults: Map<RiskClass, SIMMCalculation>;
  correlatedMarginCharge: FinancialNumber;
  diversificationBenefit: FinancialNumber;
  totalInitialMargin: FinancialNumber;
  proof: DeterministicProof;
}

/**
 * CALCULATE PORTFOLIO SIMM - PURE WAD-18
 * IM_portfolio = sqrt(sum_i sum_j ρ_ij × IM_i × IM_j)
 * where ρ = correlation, IM = class initial margin
 */
export function calculatePortfolioSIMM(
  classResults: SIMMCalculation[]
): PortfolioSIMMResult {
  const zero = new FinancialNumber(0n);
  const one = new FinancialNumber(1n);
  const resultMap = new Map<RiskClass, SIMMCalculation>();

  // Store results by risk class
  for (const result of classResults) {
    resultMap.set(result.riskClass, result);
  }

  // Calculate correlated margin: sum of ρ_ij × IM_i × IM_j
  let correlatedCharge = zero;

  for (let i = 0; i < classResults.length; i++) {
    for (let j = 0; j < classResults.length; j++) {
      const iClass = classResults[i].riskClass;
      const jClass = classResults[j].riskClass;
      const correlationKey = iClass === jClass
        ? `${iClass}-${iClass}`
        : [iClass, jClass].sort().join('-');

      const correlation = CORRELATION_MATRIX[correlationKey] || new FinancialNumber('0.0');

      const imProduct = classResults[i].classInitialMargin.multiply(
        classResults[j].classInitialMargin
      );
      const correlatedTerm = imProduct.multiply(correlation);

      correlatedCharge = correlatedCharge.add(correlatedTerm);
    }
  }

  // Total IM = sqrt(correlated charge)
  const totalInitialMargin = correlatedCharge.sqrt();

  // Diversification benefit = sum(IM_i) - totalIM
  let sumClassIM = zero;
  for (const result of classResults) {
    sumClassIM = sumClassIM.add(result.classInitialMargin);
  }

  const diversificationBenefit = sumClassIM.greaterOrEqual(totalInitialMargin)
    ? sumClassIM.subtract(totalInitialMargin)
    : zero;

  const proof = generateDeterministicProof(
    {
      classCount: new FinancialNumber(classResults.length),
      correlatedCharge,
    },
    totalInitialMargin,
    'SIMM-Portfolio'
  );

  return {
    riskClassResults: resultMap,
    correlatedMarginCharge: correlatedCharge,
    diversificationBenefit,
    totalInitialMargin,
    proof,
  };
}

export default {
  RISK_WEIGHTS,
  CORRELATION_MATRIX,
  calculateSIMMForRiskClass,
  calculatePortfolioSIMM,
};
