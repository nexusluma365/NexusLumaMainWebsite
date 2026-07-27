const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats an integer amount in cents as a USD currency string.
 * Never do floating-point dollar math — always work in cents until display.
 */
export function formatCurrency(amountInCents: number): string {
  return usdFormatter.format(amountInCents / 100);
}

/**
 * Formats an integer amount in cents as a whole-dollar display string,
 * e.g. 9900 -> "$99". Falls back to full cents formatting if the amount
 * isn't a whole dollar value.
 */
export function formatWholeDollar(amountInCents: number): string {
  if (amountInCents % 100 === 0) {
    return `$${amountInCents / 100}`;
  }
  return formatCurrency(amountInCents);
}
