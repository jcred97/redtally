import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ViewTransition } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RedTally - Budget & Expense Tracker",
  description: "Track your expenses",
  icons: { icon: { url: "/branding/redtally-icon.png?v=4", type: "image/png", sizes: "64x64" } },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ViewTransition update="page-fade">
          <div className="flex flex-1 flex-col">{children}</div>
        </ViewTransition>
      </body>
    </html>
  );
}
