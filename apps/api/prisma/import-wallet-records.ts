import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '../src/generated/prisma/client';
import {
  buildWalletImportPlan,
  type WalletImportPlan,
} from '../src/common/imports/wallet-records';
import { PrismaService } from '../src/prisma/prisma.service';

const TARGET_EMAIL = 'hasanafridi38@gmail.com';

const EXPECTED_CURRENT_STATE = {
  baseCurrency: 'PKR',
  accounts: [
    {
      name: 'ABL Bank',
      type: 'BANK',
      currency: 'PKR',
      openingBalance: '140000',
    },
    {
      name: 'Binance',
      type: 'CRYPTO_WALLET',
      currency: 'USD',
      openingBalance: '1500',
    },
    {
      name: 'Nayapay',
      type: 'DIGITAL_WALLET',
      currency: 'PKR',
      openingBalance: '150',
    },
  ],
  transactions: [
    {
      type: 'INVESTMENT_BUY',
      accountName: 'Binance',
      destinationAccountName: null,
      amount: '654.65',
      currency: 'USD',
      occurredAt: '2026-07-29T00:00:00.000Z',
      description: 'Bitcoin for long term',
    },
  ],
} as const;

interface CliOptions {
  readonly file: string;
  readonly userEmail: string;
  readonly shouldApply: boolean;
  readonly confirmationEmail: string | null;
  readonly allowStateChange: boolean;
}

interface CurrentState {
  readonly baseCurrency: string;
  readonly accounts: ReadonlyArray<{
    readonly name: string;
    readonly type: string;
    readonly currency: string;
    readonly openingBalance: string;
  }>;
  readonly transactions: ReadonlyArray<{
    readonly type: string;
    readonly accountName: string;
    readonly destinationAccountName: string | null;
    readonly amount: string;
    readonly currency: string;
    readonly occurredAt: string;
    readonly description: string;
  }>;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const csvPath = resolve(options.file);
  const importPlan = buildWalletImportPlan(readFileSync(csvPath, 'utf8'));
  const prisma = new PrismaService();

  try {
    await prisma.$connect();
    const user = await findTargetUser(prisma, options.userEmail);
    const currentState = toCurrentState(user);
    assertExpectedCurrentState(currentState, options.allowStateChange);

    printImportReport({
      mode: options.shouldApply ? 'APPLY' : 'DRY RUN',
      csvPath,
      userEmail: options.userEmail,
      importPlan,
      currentState,
    });

    if (!options.shouldApply) {
      console.log('\nDry run complete. No database records were changed.');
      return;
    }

    if (options.confirmationEmail !== options.userEmail) {
      throw new Error(
        `Apply mode requires --confirm-replace ${options.userEmail}.`,
      );
    }

    const result = await prisma.$transaction(
      async (transactionClient) => {
        const transactionUser = await findTargetUser(
          transactionClient,
          options.userEmail,
        );
        assertExpectedCurrentState(
          toCurrentState(transactionUser),
          options.allowStateChange,
        );

        const deletedTransactions =
          await transactionClient.transaction.deleteMany({
            where: { userId: transactionUser.id },
          });
        const deletedAccounts = await transactionClient.account.deleteMany({
          where: { userId: transactionUser.id },
        });

        const accountIds = new Map<string, string>();
        for (const account of importPlan.accounts) {
          const createdAccount = await transactionClient.account.create({
            data: {
              userId: transactionUser.id,
              name: account.name,
              type: account.type,
              currency: account.currency,
              openingBalance: account.openingBalance,
              openedAt: new Date(account.openedAt),
            },
            select: { id: true, name: true },
          });
          accountIds.set(createdAccount.name, createdAccount.id);
        }

        const createdTransactions =
          await transactionClient.transaction.createMany({
            data: importPlan.transactions.map((transaction) => {
              const accountId = accountIds.get(transaction.accountName);
              const destinationAccountId = transaction.destinationAccountName
                ? accountIds.get(transaction.destinationAccountName)
                : undefined;

              if (!accountId) {
                throw new Error(
                  `No created account ID was found for ${transaction.accountName}.`,
                );
              }
              if (transaction.destinationAccountName && !destinationAccountId) {
                throw new Error(
                  `No created destination account ID was found for ${transaction.destinationAccountName}.`,
                );
              }

              return {
                userId: transactionUser.id,
                idempotencyKey: transaction.idempotencyKey,
                type: transaction.type,
                accountId,
                destinationAccountId,
                amount: transaction.amount,
                currency: transaction.currency,
                occurredAt: new Date(transaction.occurredAt),
                description: transaction.description,
                merchant: transaction.merchant,
                notes: transaction.notes,
              };
            }),
          });

        if (createdTransactions.count !== importPlan.transactions.length) {
          throw new Error(
            `Expected to create ${importPlan.transactions.length} transactions, but created ${createdTransactions.count}.`,
          );
        }

        return {
          deletedAccountCount: deletedAccounts.count,
          deletedTransactionCount: deletedTransactions.count,
          createdAccountCount: accountIds.size,
          createdTransactionCount: createdTransactions.count,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    console.log('\nImport committed successfully.');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

function parseCliOptions(argumentsList: readonly string[]): CliOptions {
  if (argumentsList.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  let file: string | null = null;
  let userEmail: string | null = null;
  let confirmationEmail: string | null = null;
  let shouldApply = false;
  let allowStateChange = false;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    switch (argument) {
      case '--file':
        file = readOptionValue(argumentsList, ++index, '--file');
        break;
      case '--user-email':
        userEmail = readOptionValue(argumentsList, ++index, '--user-email');
        break;
      case '--confirm-replace':
        confirmationEmail = readOptionValue(
          argumentsList,
          ++index,
          '--confirm-replace',
        );
        break;
      case '--apply':
        shouldApply = true;
        break;
      case '--allow-state-change':
        allowStateChange = true;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (!file) {
    throw new Error('--file is required.');
  }
  if (!userEmail) {
    throw new Error('--user-email is required.');
  }
  if (userEmail !== TARGET_EMAIL) {
    throw new Error(
      `This one-time importer is locked to ${TARGET_EMAIL}; received ${userEmail}.`,
    );
  }
  if (!shouldApply && confirmationEmail) {
    throw new Error(
      '--confirm-replace can only be used together with --apply.',
    );
  }

  return {
    file,
    userEmail,
    shouldApply,
    confirmationEmail,
    allowStateChange,
  };
}

function readOptionValue(
  argumentsList: readonly string[],
  index: number,
  optionName: string,
): string {
  const value = argumentsList[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

async function findTargetUser(client: Prisma.TransactionClient, email: string) {
  const user = await client.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      baseCurrency: true,
      accounts: {
        orderBy: { name: 'asc' },
        select: {
          name: true,
          type: true,
          currency: true,
          openingBalance: true,
        },
      },
      transactions: {
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        select: {
          type: true,
          amount: true,
          currency: true,
          occurredAt: true,
          description: true,
          account: { select: { name: true } },
          destinationAccount: { select: { name: true } },
        },
      },
    },
  });

  if (!user) {
    throw new Error(`No local application user was found for ${email}.`);
  }

  return user;
}

function toCurrentState(
  user: Awaited<ReturnType<typeof findTargetUser>>,
): CurrentState {
  return {
    baseCurrency: user.baseCurrency,
    accounts: user.accounts.map((account) => ({
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalance: account.openingBalance.toString(),
    })),
    transactions: user.transactions.map((transaction) => ({
      type: transaction.type,
      accountName: transaction.account.name,
      destinationAccountName: transaction.destinationAccount?.name ?? null,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      occurredAt: transaction.occurredAt.toISOString(),
      description: transaction.description,
    })),
  };
}

function assertExpectedCurrentState(
  currentState: CurrentState,
  allowStateChange: boolean,
): void {
  if (JSON.stringify(currentState) === JSON.stringify(EXPECTED_CURRENT_STATE)) {
    return;
  }
  if (allowStateChange) {
    console.warn(
      'WARNING: The target state differs from the reviewed snapshot; continuing because --allow-state-change was provided.',
    );
    return;
  }

  throw new Error(
    'The target user state differs from the reviewed snapshot. Run a new dry run, review the reported state, and use --allow-state-change only if replacement is still intended.',
  );
}

function printImportReport(input: {
  readonly mode: 'APPLY' | 'DRY RUN';
  readonly csvPath: string;
  readonly userEmail: string;
  readonly importPlan: WalletImportPlan;
  readonly currentState: CurrentState;
}): void {
  console.log(`Wallet records import: ${input.mode}`);
  console.log(`Source: ${input.csvPath}`);
  console.log(`Target user: ${input.userEmail}`);
  console.log(
    JSON.stringify(
      {
        existing: {
          accountsToReplace: input.currentState.accounts.length,
          transactionsToReplace: input.currentState.transactions.length,
        },
        source: {
          rows: input.importPlan.sourceRowCount,
          dateRange: input.importPlan.dateRange,
        },
        normalized: {
          accounts: input.importPlan.accounts.length,
          ordinaryExpenses: input.importPlan.ordinaryExpenseCount,
          ordinaryIncome: input.importPlan.ordinaryIncomeCount,
          pairedTransferRows: input.importPlan.pairedTransferRowCount,
          transfers: input.importPlan.transferTransactionCount,
          adjustments: input.importPlan.adjustmentTransactionCount,
          totalTransactions: input.importPlan.transactions.length,
        },
        accounts: input.importPlan.accounts,
        derivedBalances: input.importPlan.derivedBalances,
      },
      null,
      2,
    ),
  );
}

function printUsage(): void {
  console.log(`Usage:
  pnpm import:wallet -- --file <csv-path> --user-email ${TARGET_EMAIL}
  pnpm import:wallet -- --file <csv-path> --user-email ${TARGET_EMAIL} --apply --confirm-replace ${TARGET_EMAIL}

Options:
  --file                 Semicolon-delimited wallet CSV export.
  --user-email           Must be ${TARGET_EMAIL}.
  --apply                Replace the target user's accounts and transactions.
  --confirm-replace      Required in apply mode and must equal the target email.
  --allow-state-change   Override the reviewed database-state guard after a new review.
  --help                 Show this help.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
