/**
 * R3 COLLATERAL MANAGER - PURE WAD-18 ARITHMETIC
 * 
 * SPECIFICATION: ALL arithmetic is WAD-18 fixed-point (10^18 scale)
 * - No floating-point operations
 * - Pure bigint arithmetic
 * - Decidable (all operations terminate exactly)
 * - Deterministic (identical results across all systems)
 * - Zero rounding drift
 */

import FinancialNumber, {
  generateDeterministicProof,
  DeterministicProof,
  WAD,
} from '../../../r3-quant/core/FinancialArithmetic';

export type CollateralType = 'CASH' | 'UST' | 'BUND' | 'GILT' | 'JGBS' | 'IG_BONDS' | 'EQUITY_INDEX' | 'GOLD';

export interface Haircut {
  type: CollateralType;
  regulatoryHaircut: FinancialNumber;
  stressHaircut: FinancialNumber;
  liquidityBuffer: FinancialNumber;
  totalHaircut: FinancialNumber;
}

/**
 * WAD-18 HAIRCUTS (PURE BIGINT, NO FLOATING-POINT)
 * All percentages: string → FinancialNumber('0.00...')
 */
export const STANDARD_HAIRCUTS: Record<CollateralType, Haircut> = {
  CASH: {
    type: 'CASH',
    regulatoryHaircut: new FinancialNumber('0.00'),
    stressHaircut: new FinancialNumber('0.00'),
    liquidityBuffer: new FinancialNumber('0.00'),
    totalHaircut: new FinancialNumber('0.00'),
  },
  UST: {
    type: 'UST',
    regulatoryHaircut: new FinancialNumber('0.01'),
    stressHaircut: new FinancialNumber('0.02'),
    liquidityBuffer: new FinancialNumber('0.005'),
    totalHaircut: new FinancialNumber('0.035'),
  },
  BUND: {
    type: 'BUND',
    regulatoryHaircut: new FinancialNumber('0.015'),
    stressHaircut: new FinancialNumber('0.03'),
    liquidityBuffer: new FinancialNumber('0.01'),
    totalHaircut: new FinancialNumber('0.055'),
  },
  GILT: {
    type: 'GILT',
    regulatoryHaircut: new FinancialNumber('0.015'),
    stressHaircut: new FinancialNumber('0.03'),
    liquidityBuffer: new FinancialNumber('0.01'),
    totalHaircut: new FinancialNumber('0.055'),
  },
  JGBS: {
    type: 'JGBS',
    regulatoryHaircut: new FinancialNumber('0.015'),
    stressHaircut: new FinancialNumber('0.03'),
    liquidityBuffer: new FinancialNumber('0.01'),
    totalHaircut: new FinancialNumber('0.055'),
  },
  IG_BONDS: {
    type: 'IG_BONDS',
    regulatoryHaircut: new FinancialNumber('0.03'),
    stressHaircut: new FinancialNumber('0.06'),
    liquidityBuffer: new FinancialNumber('0.02'),
    totalHaircut: new FinancialNumber('0.11'),
  },
  EQUITY_INDEX: {
    type: 'EQUITY_INDEX',
    regulatoryHaircut: new FinancialNumber('0.15'),
    stressHaircut: new FinancialNumber('0.30'),
    liquidityBuffer: new FinancialNumber('0.10'),
    totalHaircut: new FinancialNumber('0.55'),
  },
  GOLD: {
    type: 'GOLD',
    regulatoryHaircut: new FinancialNumber('0.10'),
    stressHaircut: new FinancialNumber('0.20'),
    liquidityBuffer: new FinancialNumber('0.05'),
    totalHaircut: new FinancialNumber('0.35'),
  },
};

export interface CollateralAsset {
  assetId: string;
  type: CollateralType;
  quantity: FinancialNumber;
  unitPrice: FinancialNumber;
  currency: string;
  marketValue: FinancialNumber;
  haircut: FinancialNumber;
  haircutValue: FinancialNumber;
  liquidityRank: number;
  lastMarked: number;
}

export interface CollateralInventory {
  inventoryId: string;
  assets: Map<string, CollateralAsset>;
  totalMarketValue: FinancialNumber;
  totalHaircutValue: FinancialNumber;
  availableForPosting: FinancialNumber;
  timestamp: number;
}

/**
 * CREATE INVENTORY - PURE WAD-18
 * For each asset:
 *   marketValue = quantity × unitPrice (WAD-18 multiply)
 *   haircutValue = marketValue × (1 - haircut) (WAD-18 arithmetic)
 *   Accumulate using WAD-18 addition (zero drift)
 */
export function createInventory(
  assets: Array<{
    assetId: string;
    type: CollateralType;
    quantity: FinancialNumber;
    unitPrice: FinancialNumber;
    currency: string;
  }>
): CollateralInventory {
  const assetMap = new Map<string, CollateralAsset>();
  const zero = new FinancialNumber(0n);
  let totalMarketValue = zero;
  let totalHaircutValue = zero;

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    
    // WAD-18: quantity × unitPrice (pure bigint multiply)
    const marketValue = asset.quantity.multiply(asset.unitPrice);
    
    // Get haircut (pre-computed in STANDARD_HAIRCUTS)
    const haircut = STANDARD_HAIRCUTS[asset.type].totalHaircut;
    
    // WAD-18: marketValue × (1 - haircut)
    const one = new FinancialNumber(1n);
    const haircutValue = marketValue.multiply(one.subtract(haircut));

    const collateralAsset: CollateralAsset = {
      assetId: asset.assetId,
      type: asset.type,
      quantity: asset.quantity,
      unitPrice: asset.unitPrice,
      currency: asset.currency,
      marketValue,
      haircut,
      haircutValue,
      liquidityRank: i + 1,
      lastMarked: Date.now(),
    };

    assetMap.set(asset.assetId, collateralAsset);
    
    // WAD-18: pure addition (zero rounding error)
    totalMarketValue = totalMarketValue.add(marketValue);
    totalHaircutValue = totalHaircutValue.add(haircutValue);
  }

  return {
    inventoryId: `INV-${Date.now()}`,
    assets: assetMap,
    totalMarketValue,
    totalHaircutValue,
    availableForPosting: totalHaircutValue,
    timestamp: Date.now(),
  };
}

export interface AllocationRequest {
  requiredAmount: FinancialNumber;
  baseCurrency: string;
  fxSpots: Map<string, FinancialNumber>;
  preferencedAssets?: string[];
}

export interface AllocationResult {
  requested: FinancialNumber;
  allocated: FinancialNumber;
  allocationList: Array<{
    assetId: string;
    quantity: FinancialNumber;
    haircutValue: FinancialNumber;
    contribution: FinancialNumber;
  }>;
  isFullyCollateralized: boolean;
  deficit: FinancialNumber;
  proof: DeterministicProof;
}

/**
 * ALLOCATE COLLATERAL - PURE WAD-18
 * Waterfall algorithm using FinancialNumber arithmetic
 * DETERMINISM: Same input → Same output (everywhere)
 */
export function allocateCollateral(
  inventory: CollateralInventory,
  request: AllocationRequest
): AllocationResult {
  const zero = new FinancialNumber(0n);
  const one = new FinancialNumber(1n);
  let remaining = request.requiredAmount;
  let allocated = zero;
  const allocationList: Array<{
    assetId: string;
    quantity: FinancialNumber;
    haircutValue: FinancialNumber;
    contribution: FinancialNumber;
  }> = [];

  // Sort assets by preference + liquidity (deterministic)
  const sortedAssets = Array.from(inventory.assets.values())
    .sort((a, b) => {
      if (request.preferencedAssets) {
        const aPreferred = request.preferencedAssets.includes(a.assetId);
        const bPreferred = request.preferencedAssets.includes(b.assetId);
        if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
      }
      return a.liquidityRank - b.liquidityRank;
    });

  // Allocate in waterfall order (WAD-18 arithmetic)
  for (const asset of sortedAssets) {
    if (remaining.getRaw() <= 0n) break;

    const assetContribution = asset.haircutValue.min(remaining);
    const unitsNeeded = assetContribution.divide(asset.unitPrice);
    const unitsAvailable = asset.quantity;
    const unitsAllocated = unitsNeeded.min(unitsAvailable);

    const contribution = unitsAllocated.multiply(asset.unitPrice);

    if (contribution.getRaw() > 0n) {
      allocationList.push({
        assetId: asset.assetId,
        quantity: unitsAllocated,
        haircutValue: contribution.multiply(one.subtract(asset.haircut)),
        contribution,
      });

      allocated = allocated.add(contribution);
      remaining = remaining.subtract(contribution);
    }
  }

  const isFullyCollateralized = remaining.getRaw() <= 0n;
  const deficit = isFullyCollateralized ? zero : remaining;

  const proof = generateDeterministicProof(
    {
      inventoryId: new FinancialNumber(inventory.inventoryId.length),
      required: request.requiredAmount,
      allocated,
    },
    allocated,
    'CollateralAllocation'
  );

  return {
    requested: request.requiredAmount,
    allocated,
    allocationList,
    isFullyCollateralized,
    deficit,
    proof,
  };
}

export interface SufficiencyReport {
  initialMarginRequired: FinancialNumber;
  variationMarginRequired: FinancialNumber;
  totalMarginRequired: FinancialNumber;
  collateralAvailable: FinancialNumber;
  bufferRequired: FinancialNumber;
  totalRequiredWithBuffer: FinancialNumber;
  isSufficient: boolean;
  shortfall: FinancialNumber;
  excessCollateral: FinancialNumber;
  proof: DeterministicProof;
}

/**
 * CHECK SUFFICIENCY - PURE WAD-18
 * totalRequiredWithBuffer = (IM + VM) × (1 + buffer%)
 * All arithmetic in FinancialNumber (zero floating-point)
 */
export function checkSufficiency(
  inventory: CollateralInventory,
  initialMargin: FinancialNumber,
  variationMargin: FinancialNumber,
  bufferPercentage: FinancialNumber = new FinancialNumber('0.10')
): SufficiencyReport {
  const zero = new FinancialNumber(0n);
  const one = new FinancialNumber(1n);

  const totalMarginRequired = initialMargin.add(variationMargin);
  const bufferRequired = totalMarginRequired.multiply(bufferPercentage);
  const totalRequiredWithBuffer = totalMarginRequired.add(bufferRequired);

  const collateralAvailable = inventory.totalHaircutValue;

  const isSufficient = collateralAvailable.greaterOrEqual(totalRequiredWithBuffer);
  
  const shortfall = isSufficient
    ? zero
    : totalRequiredWithBuffer.subtract(collateralAvailable);

  const excessCollateral = isSufficient
    ? collateralAvailable.subtract(totalRequiredWithBuffer)
    : zero;

  const proof = generateDeterministicProof(
    {
      im: initialMargin,
      vm: variationMargin,
      available: collateralAvailable,
    },
    totalRequiredWithBuffer,
    'SufficiencyCheck'
  );

  return {
    initialMarginRequired: initialMargin,
    variationMarginRequired: variationMargin,
    totalMarginRequired,
    collateralAvailable,
    bufferRequired,
    totalRequiredWithBuffer,
    isSufficient,
    shortfall,
    excessCollateral,
    proof,
  };
}

export default {
  STANDARD_HAIRCUTS,
  createInventory,
  allocateCollateral,
  checkSufficiency,
};
