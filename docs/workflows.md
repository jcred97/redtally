# RedTally workflows

- [Account settings](#account-settings)
- [Financial accounts](#financial-accounts)
- [Receipt scanning](#receipt-scanning)
- [Loans and repayments](#loans-and-repayments)

## Account settings

Open the avatar menu and select **Account settings**. In **Profile**, you can see your name and email, upload a profile photo, or switch back to your initials.

In **Receipt scanning**, choose **OpenAI** or **Anthropic**, enter your API key, and select **Test & Save**. The test uses a small amount of provider quota. After it succeeds, the settings show the provider and the last four characters of the key. You can replace the key or disconnect. The connection is available across your expense groups.

## Financial accounts

Open **Accounts → Add Account** to save a name, account type, and three-letter currency code. The form starts with **Savings** and **PHP**. A savings, checking, or credit card account can also reference a bank from the catalog.

Pay Later accounts appear automatically. Enable Shopee from the expense group’s **Payment Provider → Pay Later** tab or add a custom provider when recording a Pay Later purchase.

## Receipt scanning

1. Open **New Expense** and select **Paste Image** or **Choose Image**. Use a PNG, JPEG, or WebP up to 8 MB and 16 megapixels. Select the preview to see the full image or **Remove** to clear it.
2. Review the **On-device suggestions**. Tesseract.js reads the image in your browser and can suggest the title, merchant, peso total, date, Manila time, payment method, and bank. The image stays on the device during this scan.
3. If important fields are missing or incorrect, choose **Scan with OpenAI** or **Scan with Anthropic** if you want the provider to review the image. The image is sent only when you select that action, and the scan uses your provider quota or balance. If the button says **Set up AI scanning**, configure a provider in the dialog and return to the same receipt and draft.
4. Select **Use** on each suggestion you want to apply. Review the editable fields and select **Save expense** when ready. After an AI scan, you can switch between AI and on-device suggestions when both are available.

Dense marketplace screenshots can produce partial results on-device. RedTally enlarges small screenshots before reading them and can make a second pass over the shop and checkout section if Tesseract recognizes its labels. For order summaries such as Shopee, the scanner looks for the **Order placed** date and time. For a purchase or payment receipt, it can suggest the transaction timestamp. Enter the details manually when the receipt or scanner leaves them unclear.

Apply or select the payment method before using a bank suggestion. The bank must match an enabled bank in the expense group that supports the selected method.

### Receipt scanner deployment

Apply the [receipt scanner migration](../server/db/migrations/20261119120000_receipt_scanner/migration.sql) before deploying the matching application. Set `RECEIPT_SCANNER_ENCRYPTION_KEY` to a separate base64-encoded 32-byte secret in each environment that offers AI scanning. Keep the secret stable across deployments. Changing it requires users to replace their saved API keys. On-device scanning works without this setting.

RedTally stores the user’s provider key encrypted and retains its last four characters for display. The scan endpoint returns suggestions and does not store the uploaded receipt. [OpenAI vision guide](https://developers.openai.com/api/docs/guides/images-vision) · [Anthropic vision guide](https://platform.claude.com/docs/en/build-with-claude/vision)

## Loans and repayments

**Loans** lists cash loans with outstanding balances and payment information. Select a loan to see its lender, terms, repayment schedule, and payment history. Enter receiving and funding account names as text until the financial-account ledger is available. [Production rollout](../README.md#loans-production-rollout) · [Financial accounts roadmap](roadmap.md#phase-2-financial-accounts-income-and-bills)

### Recording a cash loan

Open **Loans → Add Loan**. Record the lender, amount borrowed, disbursement date, receiving bank account or wallet, and repayment schedule. Leave **Expense Group** blank for a general loan or select a group such as **Renovation** when the loan funds a specific purpose. A linked group opens the same record through **View Loan**. Deleting an empty expense group removes its link and preserves the loan and payments.

Purchases funded with cash-loan proceeds count toward group spending as they occur. See the [loan and financed-purchase relationships](data-model.md#loan-and-financed-purchase-relationships) for ownership, history, and planned cash-flow handling.

### Recording repayments

Open a cash loan and choose **Record Payment**. Enter the funding bank account or wallet name and apply the payment to the installments it covers.

### Managing Pay Later in an expense group

Open **Payment Provider → Pay Later** in the expense group and select a provider. For Shopee, check **Enable for this expense group** and select **SPayLater** under **Credit methods**. Save the setting to make the provider available for new purchases in that group. Clearing **Enable for this expense group** preserves existing purchases and schedules.

### Recording a Pay Later purchase

1. In the expense group, open **New Expense** and enter the full purchase amount, date, and category.
2. Select **Pay Later** and choose an enabled credit account. To record a purchase with a new provider, select **Add credit account** and enter its name. This enables the new account in that expense group.
3. Select the **Term** and enter the provider's due dates and installment amounts. Then select **Save expense**.

The full purchase counts once toward spending. For SPayLater, **Payment Provider → Pay Later** shows the purchases, outstanding balances, and installment schedules for the current group. Select **View plan** there or in expense history to see the payment history and record a repayment.

Editing a financed expense can change its descriptive fields while preserving the original repayment plan. Duplicating an expense group copies its provider settings and expense history. The repayment plans stay with the original expenses.
