# Account settings and receipt scanning

**Status:** Implemented.

Add **Account settings** to the avatar dropdown, directly below the signed-in person's name and email and above **Sign out**. A personal AI provider connection belongs to the signed-in person and can serve all their expense groups. Use **Receipt scanning** as the settings label so users can find it by the task they want to do. Use **API key** as the field label after they choose a provider.

## Settings page

Use a narrow left sidebar on desktop, with the selected section marked in RedTally red. On phones, show two tabs above the form.

| Section | What the person can do |
| --- | --- |
| **Profile** | View their name and email and choose a profile photo or use their initials. |
| **Receipt scanning** | Choose an optional AI provider, enter a key, and select **Test & Save**. After a successful test, show the provider and a masked key, with actions to replace the key or disconnect. |

## From a pasted receipt

Keep on-device reading as the default when someone pastes or chooses an image in **New Expense**. Offer AI scanning beside the suggestions, including when some fields were read successfully. For example, a receipt might show the right merchant but still be missing its total.

1. If the person has no provider connected, offer **Set up AI scanning**. Open the Receipt scanning section and return them to the same image and expense draft when they finish or cancel.
2. With a provider connected, offer **Scan with [provider]**, using its actual name. Explain beside the action that it sends this image to that provider and uses the person's quota or balance. Send the image only when they choose to scan.
3. Show the resulting suggestions for individual review. Applying a suggestion updates the chosen field. The person decides when to save the expense.

## Deployment

Apply the committed `20261119120000_receipt_scanner` migration before deploying the app. Set `RECEIPT_SCANNER_ENCRYPTION_KEY` to a separate base64-encoded 32-byte secret in each environment where AI scanning should be enabled. Keep the secret stable across deployments. If it changes, users must replace their stored API keys. On-device reading works without this setting.

RedTally supports OpenAI and Anthropic. Connection testing makes a small text request using the selected provider's quota. RedTally stores the encrypted key and its last four characters for display. The scan endpoint returns suggestions and does not store the uploaded receipt. [OpenAI vision guide](https://developers.openai.com/api/docs/guides/images-vision) · [Anthropic vision guide](https://platform.claude.com/docs/en/build-with-claude/vision)

## Design reference

In the supplied Simply Wall St screenshots, the avatar menu leads to **Profile & Account Settings**, the settings page has section navigation, and **Charlie** is also accessible from the main interface. For RedTally, the corresponding place to use AI is beside the receipt being reviewed. [Simply Wall St account guide](https://support.simplywall.st/hc/en-us/articles/10130202655759-Account-Management-Profile-Login-Password-Notifications)
