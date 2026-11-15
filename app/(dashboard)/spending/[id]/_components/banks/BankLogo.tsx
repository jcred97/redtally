"use client";

import Image from "next/image";
import { useState } from "react";

const bankLogos = new Set([
  "bdo-unibank",
  "bpi",
  "metrobank",
  "landbank",
  "chinabank",
  "rcbc",
  "security-bank",
  "pnb",
  "unionbank",
  "eastwest-bank",
  "cimb-bank-philippines",
  "gotyme-bank",
  "maya-bank",
  "maribank-philippines",
  "overseas-filipino-bank",
  "tonik-digital-bank",
  "uniondigital-bank",
  "unobank",
]);

export default function BankLogo({ name, compact = false }: { name: string; compact?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const words = name.trim().split(/\s+/);
  const slug = words.join("-").toLowerCase();
  const logo = slug === "bdo" ? "bdo-unibank" : slug;
  const src = `/banks/${logo}.png`;
  const showLogo = bankLogos.has(logo) && failedSrc !== src;
  const imageSize = compact ? 20 : 32;
  const initials = words.length === 1
    ? words[0].slice(0, 2)
    : words.slice(0, 2).map((word) => word[0]).join("");

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full ${compact ? "size-7" : "size-11"} ${
        showLogo ? "bg-white" : "bg-gray-700 text-xs font-semibold uppercase text-gray-100"
      }`}
    >
      {showLogo ? (
        <Image
          src={src}
          alt=""
          width={imageSize}
          height={imageSize}
          unoptimized
          className={`object-contain ${compact ? "size-5" : "size-8"}`}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
