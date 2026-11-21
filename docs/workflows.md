# RedTally workflows

- [Account settings](#account-settings)
- [Receipt scanning](#receipt-scanning)
- [Pay Later setup and purchases](#pay-later-setup-and-purchases)

## Account settings

Open the avatar menu and select **Account settings**. In **Profile**, you can see your name and email, upload a profile photo, or switch back to your initials.

In **Receipt scanning**, choose **OpenAI** or **Anthropic**, enter your API key, and select **Test & Save**. The test uses a small amount of provider quota. After it succeeds, the settings show the provider and the last four characters of the key. You can replace the key or disconnect. The connection is available across your expense groups.

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

## Pay Later setup and purchases

### Managing Pay Later in an expense group

Open **Payment Provider → Pay Later** in the expense group where you use the provider. For a preset such as Shopee, Lazada, GCash, Atome, BillEase, or Home Credit, select the provider, check **Enable for this expense group**, and select **Save changes**. To set up a custom provider in the group, choose **Add credit provider**, enter its name, and select **Create**.

Clearing **Enable for this expense group** hides the provider from new purchases. Existing expenses keep their saved provider.

### Recording a Pay Later purchase

1. In the expense group, open **New Expense** and enter the full purchase amount, date, and category.
2. Set **Payment Method** to **Pay Later** and choose an enabled **Payment Provider**, such as **Shopee**. Enable providers for the group under **Payment Provider → Pay Later**.
3. Select **Save expense**.

The full purchase counts once toward spending. The **Payment Provider** column in **Expenses** shows the saved provider’s name.

You can edit a purchase and keep its saved provider even after disabling it. To change the provider, choose one that’s enabled for the group. Duplicating an expense group copies its provider settings and expense history.
