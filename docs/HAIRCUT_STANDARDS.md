# Regulatory Haircut Standards (BCBS 239)

## Asset Class Haircuts

All haircuts are composed of three components:

1. **Regulatory haircut** - Baseline per asset class
2. **Stress haircut** - Additional for volatile markets
3. **Liquidity buffer** - For illiquid assets

## Standard Haircuts

| Asset Type    | Total | Regulatory | Stress | Liquidity |
|---------------|-------|-----------|--------|-----------|
| CASH          | 0.0%  | 0%        | 0%     | 0%        |
| UST           | 3.5%  | 1%        | 2%     | 0.5%      |
| BUND/GILT/JGB | 5.5%  | 1.5%      | 3%     | 1%        |
| IG_BONDS      | 11.0% | 3%        | 6%     | 2%        |
| EQUITY_INDEX  | 55.0% | 15%       | 30%    | 10%       |
| GOLD          | 35.0% | 10%       | 20%    | 5%        |

## Calculation

Haircut value (WAD-18):
```
haircutValue = marketValue × (1 - totalHaircut)
```

Example (UST, WAD-18):
```
marketValue = $100,000,000
haircut = 0.035 (3.5%)
haircutValue = $100M × (1 - 0.035) = $96,500,000
```

All arithmetic is pure WAD-18 (zero floating-point).

