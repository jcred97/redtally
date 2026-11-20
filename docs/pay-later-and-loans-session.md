# Pay Later and Loans design notes

The Loans workflow covers cash loans, purchases financed through SPayLater or another provider, and repayments. It went live on November 20, 2026 after the production migration. The signed-in Loan List was verified. Receiving and funding account names are entered manually. Ledger-backed disbursements and repayments remain part of the wider financial accounts work. [Production rollout](../README.md#loans-production-rollout) · [Phase 2 roadmap](roadmap.md#phase-2-financial-accounts-income-and-bills)

## Loans navigation

**Loans** sits alongside the main **Dashboard** and **Expense Groups**. It has two tabs.

```text
Loans
├── Dashboard
│   ├── Total outstanding
│   ├── Upcoming and overdue payments
│   └── Recent payments
└── Loan List
    ├── Cash loan row → Loan details
    ├── Financed purchase row → Repayment plan → Original expense
    ├── Add Loan → Cash loan form
    └── Manage Credit Accounts
        └── Provider account → Bills, linked plans, and Record Bill Payment
```

The **Loan List** has one row per cash loan and one row per financed purchase. Use **Name**, **Type or Provider**, **Outstanding**, and **Next Payment** as the main columns. The name opens the detail page. Several purchases can show SPayLater as their provider. The reusable account is available through **Manage Credit Accounts** or the provider link on a purchase plan. Its combined balance is a summary of the underlying plans, which each count once in the Loans Dashboard total.

- **Cash loan details** show the lender, original amount borrowed, outstanding balance, repayment frequency, term, installments left, next amount and due date, full schedule, and payment history. Show the receiving account and the expense group link when available. Put **Record Payment** beside the next payment.
- **Financed purchase details** show the provider, original expense and group, purchase amount, outstanding balance, term, installments left, next amount and due date, full schedule, and payment history.

## Ownership and links

```text
User
├── ExpenseGroup → Expense
├── Loan → Repayment schedule
│   └── Optional link to an ExpenseGroup owned by the same user
└── PayLaterAccount
    └── RepaymentPlan → Original Expense
        └── Installments
```

`Loan` is a first-class, user-owned record. A cash loan can use an optional `expenseGroupId` when it funds a specific purpose. The group can show **View Loan**, which opens the same loan details shown in the Loan List. Each financed purchase has a plan under a reusable provider account. Its expense group comes from the linked expense, so the user selects the group once. These relationships cover grouping by purpose and credit account. A separate `LoanGroup` can wait until users need custom collections spanning lenders. Integration with balance-bearing financial accounts remains planned. [Financial data model](data-model.md#planned-financial-model-dependencies)

## Recording a financed purchase

1. In **New Expense**, enter the full purchase amount and date in the appropriate expense group and category.
2. Choose **Pay Later** as the payment method and select **SPayLater** or another provider from **Credit Account**. **Add Credit Account** saves a reusable account and selects it without closing the expense draft.
3. Choose the item's **Term**, such as one payment on the next bill or three or six monthly payments. Use the due dates and amounts shown by the provider.
4. Save the expense and its linked repayment plan together. The full purchase counts once toward the expense group's spending. The plan is visible as its own row in **Loan List**.

The **Bank** field stays blank for a purchase funded entirely by SPayLater. At repayment, enter the name of the bank account or wallet used to pay. If the legal lender is recorded, use the name on the loan agreement. [Shopee billing guide](https://help.shopee.ph/portal/4/article/81111) · [Monee Credit terms](https://help.shopee.ph/portal/4/article/166075-Monee-Credit-Terms-and-Conditions)

## Recording a cash loan

Use **Loans → Loan List → Add Loan** for a cash or credit-to-cash loan. Record the lender, amount borrowed, disbursement date, receiving bank account or wallet, and repayment schedule. Leave **Expense Group** blank for a general cash loan or select a group such as **Renovation** when the loan is for that purpose.

Actual purchases count toward the expense group's budget as they occur. The planned ledger will record loan proceeds as increases in available funds and the amount owed, and principal repayments as cash outflows that reduce debt. It will count separately identified interest and fees as expenses when posted. [Financial data model](data-model.md#planned-financial-model-dependencies)

Deleting an empty expense group removes its link from any cash loans and keeps those loans and payments.

## Recording repayments

Use **Record Payment** from the loan, installment, or provider bill. Record the actual payment once with the bank account or wallet name. If a single provider bill covers several purchases, allocate that payment across the matching plans or installments. This reduces the outstanding balances while preserving the original expense amounts. Editing a financed expense can change its descriptive fields. Schedule and payment corrections require a future workflow that preserves recorded payments.

## Example Loan List

| Name | Type or Provider | Outstanding | Next Payment |
| --- | --- | ---: | --- |
| Personal cash loan | Cash loan | ₱12,000 | Per loan schedule |
| Renovation cash loan | Cash loan | ₱28,000 | Per loan schedule |
| Paint sprayer | SPayLater | ₱2,400 | ₱1,200 on December 15 |
| Drill set | SPayLater | ₱900 | ₱450 on December 15 |

The paint sprayer appears in Renovation as one ₱3,600 expense with a **View Plan** link. The same group shows the renovation cash loan with a **View Loan** link. An ₱8,000 tile purchase paid by debit card also counts toward Renovation spending. A ₱1,650 Shopee bill payment can cover the ₱1,200 sprayer installment and the ₱450 drill installment. Duplicating an expense group copies history without creating new payable balances.

Expenses recorded before the Loans rollout keep their original details. A new financed purchase creates a repayment plan when saved with **Pay Later**.

## Changes shipped during the chat

- `5071c54` made the preview red (`#B92334`) the shared primary color in `app/globals.css`.
- `0ae1a46` applied the same red to the active underlines in the main navigation and expense-group tabs. The compiled underline color was verified in Edge.
- `4b40c97`, the existing KISS coding guidelines commit, was pushed to `main` with the primary color change at the user's request.
