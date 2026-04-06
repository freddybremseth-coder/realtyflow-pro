import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { ChatWidget } from "@/components/chatbot/chat-widget";

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
        <ChatWidget
          brandId="soleada"
          title="Victoria AI"
          subtitle="Eiendomsrådgiver"
          welcomeMessage="Hei! Jeg er din AI-assistent. Jeg kan hjelpe deg med eiendommer i Spania, tomter, og mye mer. Hva leter du etter?"
          primaryColor="#8b5cf6"
          placeholder="F.eks. villa med basseng i Altea..."
        />
      </body>
    </html>
  );
}
