import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { StackProvider, StackTheme } from "@stackframe/stack";
import { stackServerApp } from "@/stack/server";
import { PwaRegister } from "@/components/pwa-register";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SKETCHFLOW_APP_URL } from "@/lib/config";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/500.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/500.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/800.css";
import "./globals.css";
import "@excalidraw/excalidraw/index.css";

export const metadata: Metadata = {
  metadataBase: new URL(SKETCHFLOW_APP_URL),
  applicationName: "Sketchflow",
  title: {
    default: "Sketchflow - GitHub-native visual workspace",
    template: "%s - Sketchflow",
  },
  description:
    "Sketchflow is a GitHub-native visual workspace for sketches, diagrams, docs, project memory, public pages, and AI-ready builder workflows.",
  keywords: [
    "Sketchflow",
    "GitHub whiteboard",
    "Excalidraw workspace",
    "diagramming tool",
    "architecture diagrams",
    "developer docs",
    "visual collaboration",
    "GitHub-native SaaS",
  ],
  authors: [{ name: "Sketchflow" }],
  creator: "Sketchflow",
  publisher: "Sketchflow",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Sketchflow",
    title: "Sketchflow - GitHub-native visual workspace",
    description:
      "Sketch, document, publish, and keep project memory in a GitHub repo you own.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Sketchflow GitHub-native visual workspace",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Sketchflow - GitHub-native visual workspace",
    description:
      "Sketch, document, publish, and keep project memory in a GitHub repo you own.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Sketchflow",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <StackProvider app={stackServerApp}>
            <StackTheme>
              <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
              <PwaRegister />
            </StackTheme>
          </StackProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
