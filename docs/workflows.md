# RedTally workflows

- [Account settings](#account-settings)
- [Receipt scanning](#receipt-scanning)
- [Loans and Pay Later](#loans-and-pay-later)

## Account settings

Open the avatar menu and select **Account settings**. In **Profile**, you can see your name and email, upload a profile photo, or switch back to your initials.

In **Receipt scanning**, choose **OpenAI** or **Anthropic**, enter your API key, and select **Test & Save**. The test uses a small amount of provider quota. After it succeeds, the settings show the provider and the last four characters of the key. You can replace the key or disconnect. The connection is available across your expense groups.

## Receipt scanning

1. Open **New Expense** and select **Paste Image** or **Choose Image**. Use a PNG, JPEG, or WebP up to 8 MB and 16 megapixels. Select the preview to see the full image or **Remove** to clear it.
2. Review the **On-device suggestions**. Tesseract.js reads the image in your browser and can suggest the title, merchant, peso total, date, Manila time, payment method, and bank. The image stays on the device during this scan.
3. If important fields are missing or incorrect, choose **Scan with OpenAI** or **Scan with Anthropic** if you want the provider to review the image. The image is sent only when you select that action, and the scan uses your provider quota or balance. If the button says **Set up AI scanning**, configure a provider in the dialog and return to the same receipt and draft.
4. Select **Use** on each suggestion you want to apply. Review the editable fields and select **Save expense** when ready. After an AI scan, you can switch between AI and on-device suggestions when both are available.

Dense marketplace screenshots can produce partial results on-device. RedTally enlarges small screenshots before reading them and can make a second pass over the shop and checkout section if Tesseract recognizes its labels. For order summaries such as Shopee, the scanner looks for the **Order placed** date and time. For a purchase or payment receipt, it can suggest the transaction timestamp. Enter the details manually when the receipt or scanner leaves them unclear.

Apply or select the payment method before using a bank suggestion. The bank must match an enabled bank in the expense group that supports the selected method. If a receipt shows SPayLater, **Use payment method** can select **Pay Later**. Review the credit account, term, due dates, and amounts separately before saving. See [Recording a financed purchase](#recording-a-financed-purchase).

### Receipt scanner deployment

Apply the [receipt scanner migration](../server/db/migrations/20261119120000_receipt_scanner/migration.sql) before deploying the matching application. Set `RECEIPT_SCANNER_ENCRYPTION_KEY` to a separate base64-encoded 32-byte secret in each environment that offers AI scanning. Keep the secret stable across deployments. Changing it requires users to replace their saved API keys. On-device scanning works without this setting.

RedTally stores the user’s provider key encrypted and retains its last four characters for display. The scan endpoint returns suggestions and does not store the uploaded receipt. [OpenAI vision guide](https://developers.openai.com/api/docs/guides/images-vision) · [Anthropic vision guide](https://platform.claude.com/docs/en/build-with-claude/vision)

## Loans and Pay Later

Use **Loans** for cash loans and their repayments. Use **Credit Accounts** for Pay Later purchases and provider bills. Enter receiving and funding account names as text until the financial-account ledger is available. [Production rollout](../README.md#loans-production-rollout) · [Financial accounts roadmap](roadmap.md#phase-2-financial-accounts-income-and-bills)

### Where to find loans and bills

- **Loans** opens the cash loan list with outstanding balances and payment information. Select a loan to see its repayment schedule and history.
- The **Credit Accounts** tab beside **Banks** shows the credit account cards and their current status. From **All Expense Groups**, open **Credit Accounts** to see upcoming and overdue Pay Later bills across your groups.

Cash loan details show the lender, amount borrowed, receiving account, optional expense group, repayment frequency and term, installments, and payment history. A financed purchase shows its provider, original expense and expense group, purchase amount, outstanding balance, and schedule.

### Managing credit accounts

Open **Expense Groups → Credit Accounts** and select the **Shopee · SPayLater** card to open its settings. Check **Enable SPayLater** and select **Save changes** to make the account available in **New Expense → Pay Later**. This setting applies across your expense groups. Each purchase has its own repayment term and schedule.

Clear **Enable SPayLater** in settings and save to hide it from new expenses. Once an SPayLater account exists, **View Account** opens its repayment plans and payment history and lets you record a payment even when the account is disabled. In the group tab, **View Account** is inside the card's settings dialog. Re-enabling SPayLater uses the same account.

To add an account for another provider, open **All Expense Groups → Credit Accounts** and select **New Credit Account**. Enter the account name in the dialog and select **Create account**. Select the new account's card to open it.

### Recording a financed purchase

1. Open **New Expense** in the appropriate expense group and enter the full purchase amount, date, and category.
2. Choose **Pay Later** as the payment method or apply it from a receipt suggestion. Under **Credit account**, select an enabled account or choose **Add credit account** and enter the new account name. The **Bank** field is hidden for Pay Later purchases.
3. Choose the **Term** and enter the due dates and amounts shown by the provider.
4. Select **Save expense**. RedTally saves the purchase, its linked repayment plan, and any new credit account together. The full purchase counts once toward the expense group’s spending. Select **View plan** in expense history or open the account in **Credit Accounts** to see the schedule.

Use the provider’s billing details when entering the schedule. [Shopee billing guide](https://help.shopee.ph/portal/4/article/81111) · [Monee Credit terms](https://help.shopee.ph/portal/4/article/166075-Monee-Credit-Terms-and-Conditions)

### Recording a cash loan

Open **Loans → Add Loan**. Record the lender, amount borrowed, disbursement date, receiving bank account or wallet, and repayment schedule. Leave **Expense Group** blank for a general loan or select a group such as **Renovation** when the loan funds a specific purpose. A linked group opens the same record through **View Loan**. Deleting an empty expense group removes its link and preserves the loan and payments.

Purchases funded with cash-loan proceeds count toward group spending as they occur. See the [loan and financed-purchase relationships](data-model.md#loan-and-financed-purchase-relationships) for ownership, history, and planned cash-flow handling.

### Recording repayments

Use **Record Payment** from a cash loan or financed purchase. To record a provider bill payment, open **Expense Groups → Credit Accounts**, select **View Account** for SPayLater or open a custom account card, then choose **Record Bill Payment**. Enter the funding bank account or wallet name. If one provider bill covers purchases from several expense groups, record the payment once and allocate it to the installments it covers. The allocations reduce outstanding balances and preserve the original expense amounts.

For example, a ₱3,600 paint sprayer bought with SPayLater appears once in Renovation spending. A ₱1,650 provider bill payment can cover a ₱1,200 sprayer installment and a ₱450 drill installment. The cash loan used for Renovation appears in **Loans**.

Editing a financed expense can change its descriptive fields. The existing payment records and schedule remain linked to the original plan. Duplicating an expense group copies expense history without creating new payable balances.
