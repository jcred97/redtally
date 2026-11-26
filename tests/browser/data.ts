export type BrowserData = {
  email: string;
  password: string;
  userId: string;
  group: { id: number; publicId: string; categoryId: number };
  merchants: { id: number; publicId: string };
  exported: { id: number; publicId: string };
  largeExport: { publicId: string };
  foreign: { id: number; publicId: string };
  olderHistory: { publicId: string };
  spayLater: { publicId: string };
  dashboard: { month: string; budgeted: string; unbudgeted: string };
};

export function browserData(): BrowserData {
  const data = process.env.REDTALLY_BROWSER_DATA;
  const database = process.env.REDTALLY_BROWSER_DATABASE_URL;
  const origin = process.env.REDTALLY_BROWSER_ORIGIN;
  if (!data || !database || !origin || new URL(origin).hostname !== "127.0.0.1"
    || new URL(database).hostname !== "127.0.0.1") {
    throw new Error("Run browser tests through npm run test:browser with its isolated local database");
  }
  return JSON.parse(data) as BrowserData;
}
