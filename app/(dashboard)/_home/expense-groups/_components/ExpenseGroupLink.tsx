import Link from "next/link";
import type { ReactNode } from "react";

export default function ExpenseGroupLink({
  publicId,
  children,
}: {
  publicId: string;
  children: ReactNode;
}) {
  return (
    <Link href={`/spending/${publicId}`} className="relative block">
      {children}
    </Link>
  );
}
