import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import type { TransactionType } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  calculateAccountBalance,
  getSourceAccountEffect,
} from '../../common/financial/transaction-effects';
import {
  parseWalletCsvV1,
  walletCsvV1Format,
  type WalletCsvItem,
} from '../../common/imports/wallet-csv-v1';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CommitTransactionImportDto,
  PreviewTransactionImportDto,
} from './dto/transaction-import.dto';

const Decimal = Prisma.Decimal.clone({ precision: 40 });
type AccountRecord = {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalance: Prisma.Decimal;
  archivedAt: Date | null;
};

@Injectable()
export class TransactionImportsService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(user: AuthenticatedUser, dto: PreviewTransactionImportDto) {
    const parsed = parseWalletCsvV1(dto.csvText);
    const [accounts, mappings, transactions] = await Promise.all([
      this.prisma.account.findMany({
        where: { userId: user.id, archivedAt: null },
        select: {
          id: true,
          name: true,
          type: true,
          currency: true,
          openingBalance: true,
          archivedAt: true,
        },
      }),
      this.prisma.transactionImportAccountMapping.findMany({
        where: { userId: user.id, sourceFormat: walletCsvV1Format },
        select: { sourceAccountKey: true, accountId: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: user.id,
          importFingerprint: {
            in: parsed.items.map((item) => item.fingerprint),
          },
        },
        select: { importFingerprint: true },
      }),
    ]);
    const mapping = new Map(
      mappings.map((entry) => [entry.sourceAccountKey, entry.accountId]),
    );
    dto.mappings?.forEach((entry) =>
      mapping.set(entry.sourceAccountKey, entry.accountId),
    );
    parsed.rows.forEach((row) => {
      if (mapping.has(row.accountKey)) return;
      const exact = accounts.find(
        (account) =>
          account.currency === row.currency &&
          account.name.normalize('NFKC').trim().toLocaleLowerCase() ===
            row.accountKey,
      );
      if (exact) mapping.set(row.accountKey, exact.id);
    });
    const duplicateFingerprints = new Set(
      transactions
        .map((entry) => entry.importFingerprint)
        .filter((value): value is string => Boolean(value)),
    );
    return {
      data: this.makePreview(
        parsed.items,
        parsed.rows,
        accounts,
        mapping,
        duplicateFingerprints,
        dto.selectedItemIds,
        dto.resolutions,
      ),
    };
  }

  async commit(user: AuthenticatedUser, dto: CommitTransactionImportDto) {
    const previous = await this.prisma.transactionImport.findFirst({
      where: { userId: user.id, idempotencyKey: dto.idempotencyKey },
    });
    if (previous)
      return {
        data: {
          importId: previous.id,
          importedCount: previous.importedCount,
          skippedDuplicateCount: previous.skippedDuplicateCount,
          adjustmentCount: previous.adjustmentCount,
          alreadyCommitted: true,
        },
      };
    const parsed = parseWalletCsvV1(dto.csvText);
    return this.prisma.$transaction(
      async (tx) => {
        const accounts = await tx.account.findMany({
          where: { userId: user.id, archivedAt: null },
          select: {
            id: true,
            name: true,
            type: true,
            currency: true,
            openingBalance: true,
            archivedAt: true,
          },
        });
        const mapping = new Map(
          dto.mappings?.map((entry) => [
            entry.sourceAccountKey,
            entry.accountId,
          ]) ?? [],
        );
        const existingMappings =
          await tx.transactionImportAccountMapping.findMany({
            where: { userId: user.id, sourceFormat: walletCsvV1Format },
            select: { sourceAccountKey: true, accountId: true },
          });
        existingMappings.forEach((entry) => {
          if (!mapping.has(entry.sourceAccountKey))
            mapping.set(entry.sourceAccountKey, entry.accountId);
        });
        const fingerprints = parsed.items.map((item) => item.fingerprint);
        const existing = await tx.transaction.findMany({
          where: { userId: user.id, importFingerprint: { in: fingerprints } },
          select: { importFingerprint: true },
        });
        const duplicate = new Set(
          existing
            .map((entry) => entry.importFingerprint)
            .filter((value): value is string => Boolean(value)),
        );
        const preview = this.makePreview(
          parsed.items,
          parsed.rows,
          accounts,
          mapping,
          duplicate,
          dto.selectedItemIds,
          dto.resolutions,
        );
        if (preview.unresolvedCount)
          throw this.invalid(
            'Resolve or skip every unmatched transfer before importing.',
          );
        if (preview.invalidMappingCount)
          throw this.invalid(
            'Map every selected wallet to a compatible active account.',
          );
        const selected = preview.items.filter(
          (item) => item.selected && !item.duplicate,
        );
        const imported = await tx.transactionImport.create({
          data: {
            userId: user.id,
            sourceFormat: walletCsvV1Format,
            fileName: dto.fileName,
            fileChecksum: checksum(dto.csvText),
            idempotencyKey: dto.idempotencyKey,
            sourceRowCount: parsed.rows.length,
            importedCount: selected.length,
            skippedDuplicateCount: preview.items.filter(
              (item) => item.duplicate,
            ).length,
            adjustmentCount: 0,
          },
        });
        for (const item of selected) {
          const accountId = mapping.get(item.accountKey)!;
          const destinationAccountId = item.destinationAccountKey
            ? mapping.get(item.destinationAccountKey)
            : undefined;
          await tx.transaction.create({
            data: {
              userId: user.id,
              importId: imported.id,
              importFingerprint: item.fingerprint,
              idempotencyKey: uuidFrom(item.fingerprint),
              type: item.type as TransactionType,
              status: 'CLEARED',
              accountId,
              destinationAccountId,
              amount: item.amount,
              currency: item.currency,
              occurredAt: new Date(item.occurredAt),
              category: item.category,
              description: '',
              merchant: item.merchant,
              notes: item.notes,
              reference: 'Wallet CSV import',
              labels: [...item.labels],
            },
          });
        }
        for (const row of new Map(
          parsed.rows.map((row) => [row.accountKey, row]),
        ).values()) {
          const accountId = mapping.get(row.accountKey);
          if (!accountId) continue;
          await tx.transactionImportAccountMapping.upsert({
            where: {
              userId_sourceFormat_sourceAccountKey: {
                userId: user.id,
                sourceFormat: walletCsvV1Format,
                sourceAccountKey: row.accountKey,
              },
            },
            create: {
              userId: user.id,
              accountId,
              sourceFormat: walletCsvV1Format,
              sourceAccountKey: row.accountKey,
              sourceAccountName: row.account,
            },
            update: { accountId, sourceAccountName: row.account },
          });
        }
        let adjustmentCount = 0;
        for (const reconciliation of dto.reconciliations ?? []) {
          if (!reconciliation.includeAdjustment) continue;
          const account = accounts.find(
            (entry) => entry.id === reconciliation.accountId,
          );
          if (!account || account.type === 'CRYPTO_WALLET')
            throw this.invalid('Reconciliation account is unavailable.');
          const current = await this.currentBalance(tx, user.id, account);
          if (!current.eq(reconciliation.expectedCurrentBalance))
            throw new ConflictException({
              error: {
                code: 'IMPORT_PREVIEW_STALE',
                message:
                  'An account balance changed. Refresh the import preview.',
              },
            });
          const effect = selected.reduce(
            (sum, item) =>
              this.effectForAccount(
                item,
                reconciliation.accountId,
                mapping,
                sum,
              ),
            new Decimal(0),
          );
          const adjustment = new Decimal(reconciliation.externalBalance)
            .minus(current)
            .minus(effect);
          if (!adjustment.isZero()) {
            adjustmentCount += 1;
            await tx.transaction.create({
              data: {
                userId: user.id,
                importId: imported.id,
                idempotencyKey: uuidFrom(
                  `${dto.idempotencyKey}:${reconciliation.accountId}`,
                ),
                type: 'ADJUSTMENT',
                status: 'CLEARED',
                accountId: reconciliation.accountId,
                amount: adjustment.toString(),
                currency: account.currency,
                occurredAt: new Date(reconciliation.occurredAt),
                category: 'Balance adjustment',
                description: '',
                notes: 'Created during wallet CSV reconciliation.',
                reference: 'Wallet CSV import',
              },
            });
          }
        }
        await tx.transactionImport.update({
          where: { id: imported.id },
          data: { adjustmentCount },
        });
        return {
          data: {
            importId: imported.id,
            importedCount: selected.length,
            skippedDuplicateCount: preview.items.filter(
              (item) => item.duplicate,
            ).length,
            adjustmentCount,
            alreadyCommitted: false,
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }

  private makePreview(
    items: readonly WalletCsvItem[],
    rows: readonly { account: string; accountKey: string; currency: string }[],
    accounts: readonly AccountRecord[],
    mapping: ReadonlyMap<string, string>,
    duplicate: ReadonlySet<string>,
    selectedIds?: readonly string[],
    resolutions?: readonly { itemId: string; resolution: string }[],
  ) {
    const selectedSet = selectedIds
      ? new Set(selectedIds)
      : new Set(
          items
            .filter(
              (item) => !duplicate.has(item.fingerprint) && !item.unresolved,
            )
            .map((item) => item.id),
        );
    const resolutionById = new Map(
      resolutions?.map((entry) => [entry.itemId, entry.resolution]) ?? [],
    );
    const sourceWallets = [
      ...new Map(rows.map((row) => [row.accountKey, row])).values(),
    ].map((row) => ({
      accountKey: row.accountKey,
      accountName: row.account,
      currency: row.currency,
      suggestedAccountId:
        mapping.get(row.accountKey) ??
        accounts.find(
          (account) =>
            account.name.normalize('NFKC').trim().toLocaleLowerCase() ===
              row.accountKey && account.currency === row.currency,
        )?.id ??
        null,
    }));
    let unresolvedCount = 0;
    let invalidMappingCount = 0;
    const output = items.map((item) => {
      const resolution = resolutionById.get(item.id);
      const type =
        item.unresolved && resolution && resolution !== 'SKIP'
          ? resolution
          : item.type;
      const selected = selectedSet.has(item.id) && resolution !== 'SKIP';
      const account = accounts.find(
        (entry) => entry.id === mapping.get(item.accountKey),
      );
      const destinationKey = item.destinationAccountKey;
      const destination = destinationKey
        ? accounts.find((entry) => entry.id === mapping.get(destinationKey))
        : null;
      const valid =
        !selected ||
        Boolean(
          type &&
          account &&
          account.currency === item.currency &&
          account.type !== 'CRYPTO_WALLET' &&
          (!item.destinationAccountKey ||
            (destination &&
              destination.currency === item.currency &&
              destination.type !== 'CRYPTO_WALLET' &&
              destination.id !== account.id)),
        );
      if (selected && item.unresolved && !type) unresolvedCount += 1;
      if (!valid) invalidMappingCount += 1;
      return {
        ...item,
        type,
        selected,
        duplicate: duplicate.has(item.fingerprint),
        valid,
        resolution: resolution ?? null,
      };
    });
    return {
      sourceRowCount: rows.length,
      sourceWallets,
      items: output,
      ordinaryExpenseCount: items.filter((item) => item.type === 'EXPENSE')
        .length,
      ordinaryIncomeCount: items.filter((item) => item.type === 'INCOME')
        .length,
      transferCount: items.filter((item) => item.type === 'TRANSFER').length,
      unresolvedCount,
      invalidMappingCount,
    };
  }

  private async currentBalance(
    tx: Prisma.TransactionClient,
    userId: string,
    account: AccountRecord,
  ): Promise<Prisma.Decimal> {
    const transactions = await tx.transaction.findMany({
      where: {
        userId,
        status: 'CLEARED',
        deletedAt: null,
        OR: [{ accountId: account.id }, { destinationAccountId: account.id }],
      },
      select: {
        type: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
      },
    });
    return calculateAccountBalance(
      account.openingBalance,
      account.id,
      transactions,
    );
  }
  private effectForAccount(
    item: {
      type: string | null;
      amount: string;
      accountKey: string;
      destinationAccountKey: string | null;
    },
    accountId: string,
    mapping: ReadonlyMap<string, string>,
    sum: Prisma.Decimal,
  ): Prisma.Decimal {
    if (!item.type) return sum;
    const amount = new Decimal(item.amount);
    if (mapping.get(item.accountKey) === accountId)
      return sum.add(getSourceAccountEffect(item.type as never, amount));
    if (
      item.type === 'TRANSFER' &&
      item.destinationAccountKey &&
      mapping.get(item.destinationAccountKey) === accountId
    )
      return sum.add(amount);
    return sum;
  }
  private invalid(message: string): BadRequestException {
    return new BadRequestException({
      error: { code: 'INVALID_TRANSACTION_IMPORT', message },
    });
  }
}

function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function uuidFrom(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
