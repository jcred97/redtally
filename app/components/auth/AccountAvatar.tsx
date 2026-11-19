import Image from "next/image";
import { isProfilePhoto } from "@/app/lib/auth/profile-photo";

export default function AccountAvatar({ name, email, image }: {
  name: string;
  email: string;
  image?: string | null;
}) {
  if (isProfilePhoto(image)) {
    return <Image src={image} alt="" width={64} height={64} unoptimized className="size-full object-cover" />;
  }
  const nameParts = name.trim().split(/\s+/);
  const initials = [nameParts[0] || email, nameParts.length > 1 ? nameParts.at(-1) : ""]
    .map((part) => Array.from(part ?? "")[0])
    .join("")
    .toUpperCase();
  return initials;
}
