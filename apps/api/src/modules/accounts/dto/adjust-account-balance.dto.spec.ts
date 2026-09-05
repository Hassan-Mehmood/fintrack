import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdjustAccountBalanceDto } from './adjust-account-balance.dto';

const payload = {
  currentBalance: '-0.00000001',
  expectedBalance: '9999999999999999.99999999',
  currency: 'PKR',
  idempotencyKey: 'ed32ab72-f77e-4eec-a090-db723db0b637',
};
describe('AdjustAccountBalanceDto', () => {
  it('accepts signed balances and all supported database precision', async () => {
    expect(
      await validate(plainToInstance(AdjustAccountBalanceDto, payload)),
    ).toEqual([]);
  });
  it.each([
    { currentBalance: '1e3' },
    { currentBalance: 'NaN' },
    { currentBalance: 10 },
    { currentBalance: '10000000000000000' },
    { currentBalance: '0.123456789' },
    { expectedBalance: undefined },
    { currency: 'EUR' },
    { idempotencyKey: 'invalid' },
  ])('rejects malformed input %j', async (change) => {
    expect(
      (
        await validate(
          plainToInstance(AdjustAccountBalanceDto, { ...payload, ...change }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
