# [Project Name]

## Overview

This application is a personal finance and investment management platform for individuals who keep money across multiple bank accounts, cash wallets, stock brokers, mutual funds, ETFs, and cryptocurrency platforms. It brings all of these accounts into one centralized dashboard where users can manually track income, expenses, transfers, investments, portfolio performance, and savings goals while receiving real-time balance updates and clear financial insights. It solves the problem of fragmented financial information by giving users a single place to understand their net worth, spending habits, available cash, investment returns, goal progress, and overall financial health.


## Goals

1. **Centralize financial accounts:** Enable users to add and manage at least five account types, including bank accounts, cash wallets, stock accounts, mutual funds, and cryptocurrency wallets, from one dashboard.

2. **Maintain accurate balances:** Automatically update account balances and total net worth immediately after users record an income, expense, transfer, or investment transaction.

3. **Improve expense tracking:** Allow users to categorize 100% of recorded expenses into default or custom categories and view monthly spending through charts and budget progress indicators.

4. **Track investment performance:** Calculate and display the current market value, cost basis, and realized and unrealized profit or loss for supported investment holdings.

5. **Support financial goal planning:** Generate daily, weekly, and monthly savings targets based on a user’s goal amount, existing savings, and target completion date.

6. **Provide financial health insights:** Calculate measurable indicators such as savings rate, emergency fund coverage, liquidity ratio, and portfolio concentration, and provide clear recommendations based on predefined rules.

7. **Ensure reliable financial records:** Preserve a complete transaction history so that every account balance can be traced back to recorded transactions and balance adjustments.

8. **Deliver a responsive user experience:** Ensure that core dashboard and transaction pages load within three seconds under normal usage and work effectively across desktop, tablet, and mobile screen sizes.


## Core User Flow

1. **User Registration and Setup**
   The user creates an account, selects a base currency, and completes a short onboarding process.

2. **Add Financial Accounts**
   The user adds bank accounts, cash wallets, stock broker accounts, mutual funds, ETFs, or cryptocurrency wallets and enters the opening balance for each account.

3. **View Initial Dashboard**
   The application calculates and displays the user’s total assets, liquid cash, investments, liabilities, and estimated net worth.

4. **Record a Transaction**
   The user selects a transaction type such as income, expense, transfer, investment purchase, investment sale, or refund.

5. **Select the Affected Account**
   The user chooses the account from which money was received, spent, transferred, or invested.

6. **Enter Transaction Details**
   The user enters the amount, date, category, merchant or description, and any optional notes or receipt.

7. **Update Financial Records**
   The application saves the transaction, updates the affected account balances, and recalculates the dashboard analytics.

8. **Review Spending and Budgets**
   The user views expenses by category, compares spending against monthly budgets, and checks income, expenses, and savings for the selected period.

9. **Track Investments**
   The user adds investment trades or updates asset prices. The application calculates holdings, cost basis, current value, and profit or loss.

10. **Create a Financial Goal**
    The user enters a goal amount, target date, current savings, and contribution frequency.

11. **Receive a Savings Plan**
    The application calculates how much the user needs to save daily, weekly, or monthly to reach the goal.

12. **Review Financial Health**
    The user receives measurable insights about savings rate, emergency fund coverage, spending patterns, liquidity, and portfolio concentration.

13. **Continue Regular Tracking**
    The user returns to record new transactions, review updated balances, monitor investments, and track progress toward financial goals.


## Features

### User Accounts and Onboarding

* Users can register, sign in, and sign out securely.
* Users can select a base currency for dashboard calculations.
* Users can complete an onboarding process to create their first financial account.

### Financial Accounts

* Users can add bank accounts, cash wallets, digital wallets, broker accounts, mutual fund accounts, and cryptocurrency accounts.
* Users can enter an opening balance for each account.
* Users can view the current balance of each account.
* Users can edit, archive, and restore financial accounts.

### Transactions

* Users can record income, expenses, transfers, refunds, fees, investment purchases, and investment sales.
* Users can select the account affected by each transaction.
* Users can add an amount, date, category, description, merchant, and notes.
* Account balances update automatically when a transaction is created.
* Users can view, filter, search, edit, and reverse recorded transactions.
* Transfers between accounts do not count as income or expenses.

### Expense Tracking and Budgets

* Users can organize expenses using default and custom categories.
* Users can view spending totals by category and time period.
* Users can create monthly budgets for individual categories.
* Users can compare actual spending against their assigned budgets.
* Users can view monthly income, expenses, savings, and savings rate.

### Centralized Dashboard

* Users can view total assets, liabilities, liquid cash, investments, and net worth.
* Users can view balances across all financial accounts.
* Users can view income and expense summaries for a selected period.
* Users can view spending distribution by category.
* Users can view recent transactions, budget progress, investment performance, and goal progress.
* Dashboard values update after financial records are created or changed.

### Investment Tracking

* Users can add stocks, ETFs, mutual funds, and cryptocurrency holdings.
* Users can record investment purchases and sales.
* Users can manually enter or update the current market price of an asset.
* The application calculates quantity held, cost basis, current value, realized profit or loss, and unrealized profit or loss.
* Users can view their investment allocation by asset and asset type.

### Financial Goals

* Users can create goals with a target amount, current savings, and target date.
* The application calculates the amount required daily, weekly, and monthly to achieve each goal.
* Users can record contributions toward a goal.
* Users can view goal progress and the remaining amount required.
* The application identifies whether the goal is achievable based on the user’s recent income and expenses.

### Financial Health Insights

* The application calculates savings rate, liquidity ratio, emergency-fund coverage, expense-to-income ratio, and portfolio concentration.
* The application provides rules-based recommendations using the user’s financial data.
* Every recommendation includes the metric and reason that triggered it.
* The application clearly presents insights as educational information rather than professional financial advice.

## Scope

### In Scope

* A responsive web application for desktop, tablet, and mobile browsers.
* User authentication and personal finance profiles.
* Manual creation and management of financial accounts.
* Manual entry of income, expenses, transfers, and investment transactions.
* Automatic account-balance calculations based on recorded transactions.
* Expense categories and monthly budgets.
* A centralized financial dashboard.
* Manual investment holdings and market-price updates.
* Basic realized and unrealized profit-and-loss calculations.
* Savings goals and contribution plans.
* Rules-based financial health calculations.
* Transaction filtering and searching.
* A single base currency for consolidated reporting.
* Secure storage of user financial records.
* Audit history for important financial changes.

### Out of Scope

* Direct synchronization with banks, brokers, mutual funds, or cryptocurrency exchanges.
* Automatic collection of transactions from SMS messages, emails, or mobile notifications.
* Live or real-time market-price streaming.
* Automated trading or investment execution.
* Cryptocurrency private-key or seed-phrase management.
* Professional investment, tax, accounting, or legal advice.
* Tax-return preparation or submission.
* Credit scoring and loan approval.
* Shared family, household, or business accounts.
* Native Android or iOS applications.
* AI-generated financial recommendations.
* Receipt scanning and OCR.
* Automatic bank-statement or broker-statement imports.
* Support for advanced investment events such as stock splits, rights issues, and bonus shares.

## Success Criteria

1. A new user can register, select a base currency, and create their first financial account.

2. A signed-in user can create at least one bank account, cash account, broker account, and cryptocurrency account.

3. A user can record an income transaction, and the selected account balance increases by the correct amount.

4. A user can record an expense transaction, and the selected account balance and expense-category total update correctly.

5. A user can transfer money between two accounts without changing total assets, net worth, income, or expenses.

6. Every displayed account balance can be calculated from the account’s opening balance and recorded transactions.

7. The dashboard correctly displays total assets, liabilities, liquid cash, investment value, and net worth.

8. A user can create custom expense categories and assign transactions to them.

9. A user can create a monthly category budget and view the amount spent, amount remaining, and percentage used.

10. A user can add an investment purchase and view the correct quantity, cost basis, current value, and unrealized profit or loss.

11. A user can manually update an asset’s market price, and the related holding value, profit or loss, and dashboard totals update correctly.

12. A user can create a financial goal with a target amount and deadline and receive correct daily, weekly, and monthly savings requirements.

13. A user can record a goal contribution and see the goal’s saved amount, remaining amount, and progress percentage update.

14. The application calculates and displays at least four financial-health metrics using the user’s recorded data.

15. Every financial-health recommendation displays the calculation or condition that caused it.

16. A user cannot access or modify another user’s accounts, transactions, investments, goals, or analytics.

17. Core dashboard and transaction pages load within three seconds under normal MVP usage.

18. The main account, transaction, dashboard, investment, budget, and goal workflows function correctly on desktop and mobile browser sizes.
