# Integration Guide: Using R3 Collateral in Production

## Installation

```bash
npm install r3-collateral-wad18-reproducibility-capsule
```

## Basic Usage

### 1. Create Inventory

```typescript
import { createInventory } from 'r3-collateral-wad18-reproducibility-capsule';
import FinancialNumber from 'r3-quant/core/FinancialArithmetic';

const inventory = createInventory([
  {
    assetId: 'UST-001',
    type: 'UST',
    quantity: new FinancialNumber('1000000'),
    unitPrice: new FinancialNumber('99.50'),
    currency: 'USD',
  },
]);
```

### 2. Check Sufficiency

```typescript
import { checkSufficiency } from 'r3-collateral-wad18-reproducibility-capsule';

const report = checkSufficiency(
  inventory,
  new FinancialNumber('25000000'),  // IM
  new FinancialNumber('5000000'),   // VM
  new FinancialNumber('0.10')       // 10% buffer
);

if (report.isSufficient) {
  console.log('Margin requirement met');
}
```

### 3. Allocate Collateral

```typescript
import { allocateCollateral } from 'r3-collateral-wad18-reproducibility-capsule';

const result = allocateCollateral(inventory, {
  requiredAmount: new FinancialNumber('50000000'),
  baseCurrency: 'USD',
  fxSpots: new Map([
    ['USD', new FinancialNumber('1.0')],
  ]),
});
```

## Production Considerations

### Error Handling

```typescript
try {
  const result = allocateCollateral(inventory, request);
  if (!result.isFullyCollateralized) {
    // Handle shortfall
    console.log('Shortfall:', result.deficit.toString());
  }
} catch (error) {
  // WAD-18 operations throw on overflow/invalid input
  console.error('Allocation error:', error);
}
```

### Proof Verification

All operations generate proofs that can be audited:

```typescript
const result = allocateCollateral(inventory, request);

// Verify proof (for regulatory audit)
const isValid = verifyProof(result.proof);
if (isValid) {
  console.log('✓ Proof verified');
}
```

### Logging & Monitoring

```typescript
const result = checkSufficiency(inventory, im, vm);

// Log for audit trail
console.log({
  timestamp: new Date().toISOString(),
  totalMarginRequired: result.totalRequiredWithBuffer.toString(),
  collateralAvailable: result.collateralAvailable.toString(),
  isSufficient: result.isSufficient,
  proofHash: result.proof.hash,
});
```

## Database Integration

WAD-18 values can be stored as strings or bigint:

```typescript
// Store as string (recommended for databases)
const stored = value.toString();  // "123456789.012345678"

// Retrieve and reconstruct
const retrieved = new FinancialNumber(stored);
```

## API Endpoint Example

```typescript
import express from 'express';
import { allocateCollateral, checkSufficiency } from 'r3-collateral-wad18-reproducibility-capsule';

const app = express();

app.post('/allocate', (req, res) => {
  try {
    const inventory = createInventory(req.body.assets);
    const result = allocateCollateral(inventory, req.body.request);
    
    res.json({
      allocated: result.allocated.toString(),
      isFullyCollateralized: result.isFullyCollateralized,
      proofHash: result.proof.hash,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

## Testing Your Integration

```bash
# Run full test suite
npm test

# Run specific test category
npm run test:wad18      # WAD-18 arithmetic
npm run test:drift      # Zero-drift verification
npm run test:determinism # Determinism proof
```

## Troubleshooting

### "Overflow during multiplication"

This means the result exceeds WAD-18 limits. Check:
- Input quantities are in correct units
- Unit prices are correctly scaled
- No mixing of different scales

### "Shortfall detected"

Insufficient collateral. Options:
- Add more collateral assets
- Reduce margin requirement
- Check FX spot rates

### "Proof verification failed"

Indicates data corruption. Verify:
- Inputs haven't been modified
- Network transmission was correct
- Storage/retrieval didn't truncate values

