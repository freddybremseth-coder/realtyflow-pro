import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "RealtyFlow Pro",
  description: "AI-Powered Real Estate & Content Super App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="no" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen">
        <Sidebar />
        <main className="lg:ml-60 min-h-screen p-6 pt-16 lg:pt-6">
          {children}
        </main>
      </body>
    </html>
  );
}
