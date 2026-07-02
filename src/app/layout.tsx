import type { Metadata } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoExist Alert — Edge early-warning for human-wildlife conflict",
  description:
    "Detect a large animal approaching the forest edge, confirm it, and warn villagers, forest guards and rail control within seconds — with the network itself monitored so a warning never silently fails.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
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
