import { cn } from '../lib/utils';

interface PriceDisplayProps {
  price: number;
  className?: string;
}

/**
 * Renders a USD price with adaptive decimal places.
 * Very small prices (< 0.0001) are displayed with a subscript zero-count
 * to avoid crowding the UI with leading zeros.
 */
export function PriceDisplay({ price, className }: PriceDisplayProps) {
  if (price === 0) return <span className={className}>$0.00</span>;

  if (price < 0.0001 && price > 0) {
    const priceStr = price.toFixed(12);
    const match = priceStr.match(/^0\.0+(?=[1-9])/);
    if (match) {
      const zerosCount = match[0].length - 2;
      const remaining = priceStr.slice(match[0].length);
      return (
        <span className={cn('font-mono', className)}>
          $0.0<sub className="price-sub">{zerosCount}</sub>{remaining.slice(0, 4)}
        </span>
      );
    }
  }

  return (
    <span className={cn('font-mono', className)}>
      ${price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: price < 1 ? 6 : 2,
      })}
    </span>
  );
}
