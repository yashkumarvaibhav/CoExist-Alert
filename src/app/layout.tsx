import type { Metadata } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "./globals.css";

import { APP_NAME } from "@/lib/app-info";

const SITE_URL =
  process.env.COEXIST_PUBLIC_URL ?? "https://coexist.yashkumarvaibhav.me";
const TITLE = `${APP_NAME} — Edge early-warning for human-wildlife conflict`;
const DESCRIPTION =
  "Detect a large animal approaching the forest edge, confirm it, and warn villagers, forest guards and rail control within seconds — with the network itself monitored so a warning never silently fails.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: APP_NAME,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Applies a manually chosen theme before first paint; system preference
// applies via CSS when no choice is stored.
const themeInit = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
