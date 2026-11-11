/**
 * Exact integer-paise financial arithmetic and Indian rupee (INR) formatting.
 *
 * Never passes financial totals through IEEE-754 floating-point math.
 */

export type PaiseInput = bigint | string | null | undefined;

const INR_WHOLE_FORMATTER = new Intl.NumberFormat('en-IN');

export function toPaiseBigInt(value: PaiseInput): bigint {
  if (value === null || value === undefined || value === '') {
    return 0n;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`Invalid paise value: "${value}"`);
  }
  return BigInt(normalized);
}

/**
 * Formats integer paise into Indian rupee notation, e.g.:
 *   6500000 -> "₹65,000.00"
 *   100000  -> "₹1,000.00"
 *   9999    -> "₹99.99"
 */
export function formatPaiseToInr(
  value: PaiseInput,
  options: { includeDecimals?: boolean; fallback?: string } = {},
): string {
  const { includeDecimals = true, fallback = '—' } = options;
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  let paise: bigint;
  try {
    paise = toPaiseBigInt(value);
  } catch {
    return fallback;
  }

  const isNegative = paise < 0n;
  const absPaise = isNegative ? -paise : paise;
  const rupees = absPaise / 100n;
  const remainder = absPaise % 100n;

  const formattedRupees = formatBigIntIndian(rupees);
  const sign = isNegative ? '-' : '';

  if (!includeDecimals && remainder === 0n) {
    return `${sign}₹${formattedRupees}`;
  }

  const paddedPaise = remainder.toString().padStart(2, '0');
  return `${sign}₹${formattedRupees}.${paddedPaise}`;
}

/**
 * Formats a non-negative integer BigInt using Indian digit grouping (e.g. 1,24,500),
 * avoiding Number precision loss for arbitrary-size BigInts.
 */
export function formatBigIntIndian(rupees: bigint): string {
  if (rupees <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return INR_WHOLE_FORMATTER.format(Number(rupees));
  }

  const digits = rupees.toString();
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${groupedRest},${lastThree}`;
}

/**
 * Parses a decimal rupee user input string (e.g. "65000" or "1245.50") into
 * exact integer paise without floating-point arithmetic.
 */
export function parseInrInputToPaise(input: string): bigint {
  const cleaned = input.replace(/[,₹\s]/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error('Enter a valid amount in rupees (up to 2 decimal places)');
  }

  const [wholePart = '0', fractionalPart = ''] = cleaned.split('.');
  const paddedFraction = fractionalPart.padEnd(2, '0');
  return BigInt(wholePart) * 100n + BigInt(paddedFraction);
}

/** Sums an array of paise string/bigint values safely using BigInt. */
export function sumPaise(values: readonly PaiseInput[]): bigint {
  let total = 0n;
  for (const val of values) {
    if (val !== null && val !== undefined && val !== '') {
      total += toPaiseBigInt(val);
    }
  }
  return total;
}

