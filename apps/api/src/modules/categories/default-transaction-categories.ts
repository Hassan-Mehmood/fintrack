import type { TransactionType } from '../../generated/prisma/enums';
import type { TransactionCategories } from './categories.types';

export const defaultTransactionCategories: TransactionCategories = {
  INCOME: ['Salary', 'Freelance', 'Business income', 'Gift', 'Other income'],
  EXPENSE: [
    'Housing',
    'Groceries',
    'Food & dining',
    'Transport',
    'Utilities',
    'Health',
    'Insurance',
    'Education',
    'Shopping',
    'Entertainment',
    'Travel',
    'Personal care',
    'Gifts & donations',
    'Taxes',
    'Other expense',
  ],
  TRANSFER: ['Transfer'],
  REFUND: ['Refund'],
  FEE: ['Fees'],
  INVESTMENT_BUY: ['Investment'],
  INVESTMENT_SELL: ['Investment'],
  DIVIDEND: ['Dividend'],
  INTEREST: ['Interest'],
  INVESTMENT_SPLIT: ['Stock split'],
  INVESTMENT_BONUS: ['Bonus shares'],
  INVESTMENT_REINVESTMENT: ['Reinvestment'],
  INVESTMENT_DEPOSIT: ['Asset deposit'],
  INVESTMENT_WITHDRAWAL: ['Asset withdrawal'],
  ADJUSTMENT: ['Balance adjustment', 'Other adjustment'],
};

export function isDefaultTransactionCategory(
  type: TransactionType,
  category: string,
): boolean {
  return defaultTransactionCategories[type].includes(category);
}
