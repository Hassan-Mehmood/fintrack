import { Prisma } from '../../generated/prisma/client';
import { calculateAccountBalance } from './transaction-effects';

it('preserves all NUMERIC(24, 8) digits when reconciling a large balance', () => {
  const balance = calculateAccountBalance(
    new Prisma.Decimal('9999999999999999.99999999'),
    'account',
    [
      {
        accountId: 'account',
        destinationAccountId: null,
        type: 'ADJUSTMENT',
        amount: new Prisma.Decimal('-9999999999999999.99999998'),
      },
    ],
  );
  expect(balance.eq('0.00000001')).toBe(true);
});
