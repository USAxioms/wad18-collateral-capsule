# WAD-18 Fixed-Point Arithmetic Specification

## Overview

WAD-18 is a fixed-point arithmetic system using a scale of 10^18. All numbers are represented as pure `bigint` (256-bit integers) with no floating-point operations.

## Scale

1 unit in WAD-18 = 10^18 smallest units

Example:
```
1.00 = 1_000_000_000_000_000_000 (bigint)
0.50 = 500_000_000_000_000_000 (bigint)
0.035 = 35_000_000_000_000_000 (bigint)
```

## Arithmetic Operations

### Addition
```typescript
a + b (in WAD-18)
```

### Subtraction
```typescript
a - b (in WAD-18)
```

### Multiplication
```typescript
(a × b) / 10^18 (scaled multiply)
```

### Division
```typescript
(a / b) × 10^18 (scaled divide)
```

### Square Root
```typescript
sqrt(a) = result such that result^2 ≈ a
```

## Precision

- 18 decimal places
- Zero rounding drift over multiple operations
- Deterministic (same input → same output everywhere)

## Compliance

WAD-18 meets requirements for:
- ✓ BCBS 239 (Banking Supervision)
- ✓ SEC Rule 2a-7 (Money Market Funds)
- ✓ CFTC Margin Rules
- ✓ ECB Collateral Framework

