# Investment Module Requirements

## Overview

The investment module should allow users to track all investment-related accounts and assets while keeping them integrated with the overall finance system.

The design should be generic enough to support current and future investment types without requiring database or backend changes.

---

# Core Principles

## 1. Accounts represent where money is held

Examples:

- Cash Wallet
- Bank Account
- Savings Account
- Binance
- Coinbase
- KTrade
- Interactive Brokers
- Meezan Mutual Funds

Accounts only represent containers that hold cash and/or investments.

---

## 2. Assets represent what the user owns

Examples:

- Bitcoin (BTC)
- Ethereum (ETH)
- Apple (AAPL)
- Fauji Fertilizer (FFC)
- Meezan Cash Fund (MCF)
- Gold

Assets should be globally unique.

There should only be one Bitcoin asset regardless of how many accounts own it.

Example:

```
BTC

Owned by:

- Binance
- Coinbase
- Ledger Wallet
```

---

# Account Types

The system should support generic account types instead of hardcoded implementations.

Examples:

## Cash Accounts

- Wallet
- Checking
- Savings
- Credit Card

## Investment Accounts

- Broker
- Crypto Exchange
- Mutual Fund
- Retirement
- Gold
- Property
- Other

New account types should be configurable without backend changes.

---

# Investment Accounts

Each investment account should contain:

- Name
- Institution
- Currency
- Current Cash Balance
- Default Risk Profile
- Status
- Notes

Example

```
Binance

Currency: USD

Cash Balance: $400

Risk: Aggressive
```

---

# Risk Profiles

Every investment account has a default risk profile.

Example

```
Binance

Default Risk

Aggressive
```

Assets inside the account inherit this risk unless overridden.

Example

```
BTC

Risk

Default

ETH

Risk

Default

USDT

Risk

Low

BNB

Risk

Moderate
```

Risk hierarchy

```
System Default

↓

Account Default

↓

Asset Override
```

---

# Risk Levels

The application should not hardcode risk values.

Risk profiles should be configurable.

Example

| Name | Score |
|-------|------:|
| Cash | 1 |
| Savings | 2 |
| Bonds | 3 |
| Mutual Funds | 5 |
| Stocks | 7 |
| Crypto | 10 |

Later this can be used for:

- Portfolio Risk Score
- Allocation Analysis
- Risk Distribution Charts

---

# Asset Categories

Assets should support categories.

Examples

- Stock
- ETF
- Mutual Fund
- Crypto
- Bond
- Commodity
- Forex
- Gold
- Real Estate
- Cash
- Private Equity

---

# Transactions

## Single Transaction System

The application should have **one transaction system**.

Do NOT create separate tables like:

- Crypto Transactions
- Stock Transactions
- Mutual Fund Transactions

Instead:

```
Transaction

↓

Optional Investment Details
```

Every financial event should be a transaction.

Examples:

- Expense
- Income
- Transfer
- Buy
- Sell
- Dividend
- Interest
- Fees

---

# Investment Transaction Details

Investment transactions contain additional metadata.

Fields:

- Asset
- Quantity
- Price
- Fees
- Trade Type
- Notes

Example

```
Transaction

Amount

-1000 USD

Investment Detail

Asset

BTC

Quantity

0.015

Price

67000

Fee

5

Trade

BUY
```

---

# Supported Investment Transaction Types

The system should support:

- Buy
- Sell
- Dividend
- Interest
- Deposit
- Withdrawal
- Transfer
- Split
- Bonus Shares
- Fee
- Tax
- Reinvestment

Additional transaction types should be extensible.

---

# Cash Flow

Purchasing an investment should not magically deduct money.

Instead the flow should be:

```
Wallet

↓

Transfer

↓

Broker Cash Balance

↓

Buy Asset

↓

Holding Created
```

Example

```
Wallet

-1000

↓

Binance Cash

+1000

↓

Buy BTC

↓

Binance Cash

-1000

↓

BTC Holding

+0.015 BTC
```

This models how real brokers operate.

---

# Holdings

Holdings should **never** be manually maintained.

They should always be derived from transactions.

Example

```
BUY

2 BTC

SELL

0.5 BTC

BUY

1 BTC
```

Current Holding

```
2.5 BTC
```

---

# Cost Basis

Average cost should always be calculated.

Example

```
BUY

1 BTC @ 60,000

BUY

1 BTC @ 80,000
```

Average Cost

```
70,000
```

No manual storage required.

---

# Portfolio

A Portfolio is **not** an account.

It is a logical grouping of accounts.

Example

```
Retirement Portfolio

- KTrade
- Meezan Mutual Funds
```

Example

```
Crypto Portfolio

- Binance
- Coinbase
- Ledger
```

A single account can belong to multiple logical views if required.

---

# Dashboard Metrics

Each investment account should expose:

- Current Value
- Cost Basis
- Unrealized Gain
- Unrealized Gain %
- Realized Gain
- Total Profit
- Total Profit %
- Dividend Income
- Interest Earned
- Total Contributions
- Cash Balance
- Allocation %
- Risk Score

---

# Portfolio Metrics

Overall portfolio should calculate:

- Total Value
- Total Contributions
- Total Return
- Total Return %
- Annual Return
- Realized Gains
- Unrealized Gains
- Fees Paid
- Portfolio Risk
- Asset Allocation

---

# Asset Allocation

The system should calculate allocation automatically.

Example

```
Stocks

40%

Crypto

30%

Mutual Funds

20%

Cash

10%
```

---

# Performance Calculations

Future support should include:

- Money Weighted Return (MWR)
- Time Weighted Return (TWR)
- CAGR
- Annualized Return

These should be calculated, not stored.

---

# Future Supported Asset Types

The design should support future investments without redesigning the schema.

Examples:

- ETFs
- REITs
- Commodities
- Options
- Futures
- NFTs
- Precious Metals
- Retirement Accounts
- Pension Funds

---

# Design Principles

## DO

- Keep one generic transaction system.
- Separate Accounts from Assets.
- Calculate holdings from transactions.
- Calculate cost basis.
- Allow configurable risk profiles.
- Allow asset-level risk overrides.
- Keep the architecture generic and extensible.

## DON'T

Do not create separate implementations for:

- Crypto
- Stocks
- Mutual Funds
- Gold
- ETFs

They should all use the same underlying investment engine.

---

# Suggested Domain Model

```
User
│
├── Accounts
│   ├── Cash Accounts
│   │   ├── Wallet
│   │   ├── Bank
│   │   └── Savings
│   │
│   └── Investment Accounts
│       ├── Binance
│       ├── KTrade
│       ├── Meezan Mutual Funds
│       └── Interactive Brokers
│
├── Assets
│   ├── BTC
│   ├── ETH
│   ├── AAPL
│   ├── FFC
│   ├── Gold
│   └── MCF
│
├── Transactions
│   ├── Income
│   ├── Expense
│   ├── Transfer
│   ├── Buy
│   ├── Sell
│   ├── Dividend
│   └── Fee
│
└── Holdings (Derived)
    ├── BTC
    ├── ETH
    ├── AAPL
    └── Gold
```

---

# Guiding Philosophy

The investment module should be built around **accounts, assets, and transactions**, not around specific investment products. Every investment type—whether crypto, stocks, mutual funds, ETFs, or future asset classes—should be represented using the same core data model. Holdings, balances, cost basis, and performance should always be derived from transactions rather than stored independently, ensuring consistency, scalability, and extensibility.