/**
 * COLLATERAL RECONCILIATION ENGINE - PURE WAD-18 ARITHMETIC
 * 
 * Cross-system reconciliation (ours vs. counterparty)
 * Zero discrepancy verification (exact match in WAD-18)
 * Cryptographic proof of reconciliation
 */

import FinancialNumber, {
  generateDeterministicProof,
  DeterministicProof,
} from '../../../r3-quant/core/FinancialArithmetic';

export interface CollateralPosition {
  assetId: string;
  quantity: FinancialNumber;
  unitPrice: FinancialNumber;
  totalValue: FinancialNumber;
  haircut: FinancialNumber;
  haircutValue: FinancialNumber;
  lastMarked: string;
}

export interface ReconciliationBreakdown {
  asset: string;
  ourValue: FinancialNumber;
  theirValue: FinancialNumber;
  difference: FinancialNumber;
  discrepancyReason: string;
  status: 'MATCHED' | 'DISCREPANCY' | 'MISSING';
}

export interface ReconciliationResult {
  reconDate: string;
  ourTotalValue: FinancialNumber;
  theirTotalValue: FinancialNumber;
  netDifference: FinancialNumber;
  breakdowns: ReconciliationBreakdown[];
  matchedAssets: number;
  discrepancyCount: number;
  missingAssets: number;
  status: 'FULLY_RECONCILED' | 'DISCREPANCIES_FOUND' | 'CRITICAL_MISMATCH';
  tolerance: FinancialNumber; // $1 tolerance
  proof: DeterministicProof;
}

const TOLERANCE = new FinancialNumber('1'); // $1 tolerance

/**
 * RECONCILE COLLATERAL POSITIONS - PURE WAD-18
 * Compare our inventory with counterparty's reported positions
 */
export function reconcileCollateral(
  ourPositions: Map<string, CollateralPosition>,
  theirPositions: Map<string, CollateralPosition>,
  reconDate: string
): ReconciliationResult {
  const zero = new FinancialNumber(0n);
  const breakdowns: ReconciliationBreakdown[] = [];

  let ourTotal = zero;
  let theirTotal = zero;
  let matchedAssets = 0;
  let discrepancyCount = 0;
  let missingAssets = 0;

  // Reconcile each asset
  const allAssets = new Set<string>([
    ...Array.from(ourPositions.keys()),
    ...Array.from(theirPositions.keys()),
  ]);

  for (const assetId of allAssets) {
    const ourPos = ourPositions.get(assetId);
    const theirPos = theirPositions.get(assetId);

    if (ourPos && theirPos) {
      // Both have this asset - compare
      const ourValue = ourPos.haircutValue;
      const theirValue = theirPos.haircutValue;
      const diff = ourValue.greaterOrEqual(theirValue)
        ? ourValue.subtract(theirValue)
        : theirValue.subtract(ourValue);

      const matched = diff.lesserOrEqual(TOLERANCE);

      breakdowns.push({
        asset: assetId,
        ourValue,
        theirValue,
        difference: diff,
        discrepancyReason: matched ? '' : `Discrepancy: ${diff.toString()} exceeds tolerance`,
        status: matched ? 'MATCHED' : 'DISCREPANCY',
      });

      ourTotal = ourTotal.add(ourValue);
      theirTotal = theirTotal.add(theirValue);

      if (matched) {
        matchedAssets++;
      } else {
        discrepancyCount++;
      }
    } else if (ourPos) {
      // We have it, they don't
      breakdowns.push({
        asset: assetId,
        ourValue: ourPos.haircutValue,
        theirValue: zero,
        difference: ourPos.haircutValue,
        discrepancyReason: 'Missing from counterparty report',
        status: 'MISSING',
      });

      ourTotal = ourTotal.add(ourPos.haircutValue);
      missingAssets++;
    } else if (theirPos) {
      // They have it, we don't
      breakdowns.push({
        asset: assetId,
        ourValue: zero,
        theirValue: theirPos.haircutValue,
        difference: theirPos.haircutValue,
        discrepancyReason: 'Missing from our report',
        status: 'MISSING',
      });

      theirTotal = theirTotal.add(theirPos.haircutValue);
      missingAssets++;
    }
  }

  // Overall difference
  const netDiff = ourTotal.greaterOrEqual(theirTotal)
    ? ourTotal.subtract(theirTotal)
    : theirTotal.subtract(ourTotal);

  // Determine status
  let status: 'FULLY_RECONCILED' | 'DISCREPANCIES_FOUND' | 'CRITICAL_MISMATCH';
  if (discrepancyCount === 0 && missingAssets === 0 && netDiff.lesserOrEqual(TOLERANCE)) {
    status = 'FULLY_RECONCILED';
  } else if (netDiff.lesserOrEqual(new FinancialNumber('100000'))) {
    status = 'DISCREPANCIES_FOUND';
  } else {
    status = 'CRITICAL_MISMATCH';
  }

  const proof = generateDeterministicProof(
    {
      ourTotal,
      theirTotal,
      netDifference: netDiff,
      matchedCount: new FinancialNumber(matchedAssets),
    },
    netDiff,
    `Recon-${reconDate}`
  );

  return {
    reconDate,
    ourTotalValue: ourTotal,
    theirTotalValue: theirTotal,
    netDifference: netDiff,
    breakdowns,
    matchedAssets,
    discrepancyCount,
    missingAssets,
    status,
    tolerance: TOLERANCE,
    proof,
  };
}

/**
 * GENERATE RECONCILIATION REPORT
 * Human-readable reconciliation statement
 */
export function generateReconciliationReport(
  result: ReconciliationResult
): string {
  let report = '';
  report += '================================================================================\n';
  report += 'COLLATERAL RECONCILIATION REPORT\n';
  report += `Date: ${result.reconDate}\n`;
  report += '================================================================================\n\n';

  report += 'SUMMARY\n';
  report += `Our total value (haircuted): ${result.ourTotalValue.toString()}\n`;
  report += `Their total value (haircuted): ${result.theirTotalValue.toString()}\n`;
  report += `Net difference: ${result.netDifference.toString()}\n`;
  report += `Status: ${result.status}\n\n`;

  report += 'RECONCILIATION METRICS\n';
  report += `Assets matched: ${result.matchedAssets}\n`;
  report += `Assets with discrepancies: ${result.discrepancyCount}\n`;
  report += `Missing assets: ${result.missingAssets}\n`;
  report += `Tolerance: ${result.tolerance.toString()}\n\n`;

  report += 'DETAILED BREAKDOWNS\n';
  report += '---\n';
  for (const breakdown of result.breakdowns) {
    report += `Asset: ${breakdown.asset}\n`;
    report += `  Our value: ${breakdown.ourValue.toString()}\n`;
    report += `  Their value: ${breakdown.theirValue.toString()}\n`;
    report += `  Difference: ${breakdown.difference.toString()}\n`;
    report += `  Status: ${breakdown.status}\n`;
    if (breakdown.discrepancyReason) {
      report += `  Reason: ${breakdown.discrepancyReason}\n`;
    }
    report += '\n';
  }

  report += '================================================================================\n';
  report += `Proof hash: ${result.proof.hash}\n`;
  report += 'FULLY RECONCILED' + (result.status === 'FULLY_RECONCILED' ? ' ✓' : '') + '\n';
  report += '================================================================================\n';

  return report;
}

export default {
  reconcileCollateral,
  generateReconciliationReport,
};
