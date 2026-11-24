import { isProfilePhoto } from "@/app/lib/auth/profile-photo";
import { requireUser } from "@/app/lib/auth/session";
import { getReceiptConnection } from "@/app/lib/receipt-scanning/credentials";
import AccountSettings from "./_components/AccountSettings";

export default async function AccountSettingsPage() {
  const user = await requireUser();
  const receiptConnection = await getReceiptConnection(user.id);

  return (
    <AccountSettings
      profile={{ name: user.name, email: user.email, image: isProfilePhoto(user.image) ? user.image : null }}
      receiptConnection={receiptConnection}
    />
  );
}
