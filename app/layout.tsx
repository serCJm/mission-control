import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mission Control — Direct the work that matters",
  description: "Organize, rename, sort, and reorder areas, projects, and tasks from one focused command center.",
  metadataBase: new URL("https://bearing-weekly.scjmoro.chatgpt.site"),
  openGraph: { title: "Mission Control", description: "Direct the work that matters.", images: [{ url: "/og.png", width: 1536, height: 1024 }] },
  twitter: { card: "summary_large_image", title: "Mission Control", description: "Direct the work that matters.", images: ["/og.png"] },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
