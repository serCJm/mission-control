import type { Metadata } from "next";
import "./globals.css";
import "./interface.css";

export const metadata: Metadata = {
  title: "FocusHQ — Direct the work that matters",
  description: "Organize, rename, sort, and reorder areas, projects, and tasks from one focused command center.",
  metadataBase: new URL("https://focushq.work"),
  openGraph: { title: "FocusHQ", siteName: "FocusHQ", description: "Direct the work that matters.", images: [{ url: "/focushq-og.png", width: 1536, height: 1024, alt: "FocusHQ — Direct the work that matters" }] },
  twitter: { card: "summary_large_image", title: "FocusHQ", description: "Direct the work that matters.", images: ["/focushq-og.png"] },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
