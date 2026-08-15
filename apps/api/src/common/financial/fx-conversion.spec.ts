import { Prisma } from '../../generated/prisma/client';
import { convertUsdPkr } from './fx-conversion';

const Decimal = Prisma.Decimal;

describe('convertUsdPkr', () => {
  it('converts in both directions with decimal-safe arithmetic', () => {
    const rate = new Decimal('280');

    expect(
      convertUsdPkr(new Decimal('1.25'), 'USD', 'PKR', rate)?.toString(),
    ).toBe('350');
    expect(
      convertUsdPkr(new Decimal('350'), 'PKR', 'USD', rate)?.toString(),
    ).toBe('1.25');
  });

  it('does not relabel unsupported or unconvertible currencies', () => {
    expect(
      convertUsdPkr(new Decimal('10'), 'EUR', 'USD', new Decimal('280')),
    ).toBeNull();
    expect(convertUsdPkr(new Decimal('10'), 'USD', 'PKR', null)).toBeNull();
  });
});
