import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./navigation-shell.css";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNexusBar } from "@/components/layout/mobile-nexus-bar";
import { ChatWidget } from "@/components/chatbot/chat-widget";
import { JarvisOverlay } from "@/components/agentic/jarvis-overlay";

export const metadata: Metadata = {
  title: "RealtyFlow Pro · Nexus OS",
  description: "Nexus-controlled multi-brand growth, sales and automation operating system",
};

const AUTH_PATH_PREFIXES = ["/login", "/reset-password", "/account/password"];
const PUBLIC_SHELL_PATH_PREFIXES = ["/demosites/preview", "/demosites/claim"];

function isAuthRoute(pathname: string) {
  return AUTH_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isPublicShellRoute(pathname: string) {
  return PUBLIC_SHELL_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = headers().get("x-pathname") || "";
  const authRoute = isAuthRoute(pathname);
  const bareRoute = authRoute || isPublicShellRoute(pathname);

  return (
    <html lang="no" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen">
        {bareRoute ? (
          <main className="min-h-screen">{children}</main>
        ) : (
          <>
            <Sidebar />
            <main className="app-shell-main min-h-screen p-4 pb-24 pt-16 sm:p-6 sm:pb-24 sm:pt-16 lg:pb-6 lg:pt-6">
              {children}
            </main>
            <MobileNexusBar />
            <ChatWidget
              brandId="freddyb"
              apiUrl="/api/nexus/victoria"
              title="Victoria · Nexus"
              subtitle="Live grensesnitt til Nexus Director"
              welcomeMessage="Hei. Jeg er Victoria, grensesnittet til Nexus OS. Du kan skrive eller snakke fritt. Jeg leser live status fra brands, kanaler, e-post, CRM, approvals, learning og autonomy policy før jeg svarer."
              primaryColor="#0891b2"
              placeholder="Skriv eller snakk fritt til Victoria…"
              voiceAutoSend
              voiceSilenceMs={9000}
            />
            <JarvisOverlay />
          </>
        )}
      </body>
    </html>
  );
}
