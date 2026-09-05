import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReorderAccountsDto } from './reorder-accounts.dto';

const firstId = 'ed32ab72-f77e-4eec-a090-db723db0b637';
const secondId = 'b7298d62-9596-4f37-bf84-bf38c0203e31';

describe('ReorderAccountsDto', () => {
  it('accepts a unique list of account ids', async () => {
    expect(
      await validate(
        plainToInstance(ReorderAccountsDto, {
          accountIds: [firstId, secondId],
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    { accountIds: [] },
    { accountIds: [firstId, firstId] },
    { accountIds: ['not-a-uuid'] },
    { accountIds: firstId },
  ])('rejects malformed account order %j', async (payload) => {
    expect(
      (await validate(plainToInstance(ReorderAccountsDto, payload))).length,
    ).toBeGreaterThan(0);
  });
});
