import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// ---> NEW: Import Clerk Provider
import { ClerkProvider } from "@clerk/nextjs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Project Prism", 
  description: "Interactive Machine Learning Pipeline",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // ---> NEW: Wrap the entire app in the Clerk Provider
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        {/* ---> FIX: Added suppressHydrationWarning to stop Grammarly from crashing React <--- */}
        <body className="min-h-full flex flex-col font-[family-name:var(--font-geist-sans)]" suppressHydrationWarning>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}