import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mission Control — Direct the work that matters",
  description: "Organize, rename, sort, and reorder areas, projects, and tasks from one focused command center.",
  metadataBase: new URL("https://bearing-weekly.scjmoro.chatgpt.site"),
  openGraph: { title: "Mission Control", description: "Direct the work that matters.", images: [{ url: "/og.png", width: 1536, height: 1024 }] },
  twitter: { card: "summary_large_image", title: "Mission Control", description: "Direct the work that matters.", images: ["/og.png"] },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
