import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bearing — A calm command center for meaningful work",
  description: "Organize tasks by area and project, keep notes with the work, and reset your bearing each week.",
  metadataBase: new URL("https://bearing-weekly.scjmoro.chatgpt.site"),
  openGraph: { title: "Bearing", description: "Make the week answer to what matters.", images: [{ url: "/og.png", width: 1536, height: 1024 }] },
  twitter: { card: "summary_large_image", title: "Bearing", description: "Make the week answer to what matters.", images: ["/og.png"] },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
