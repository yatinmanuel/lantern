import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { ConditionalLayout } from "@/components/dashboard/conditional-layout";
import { SessionGuard } from "@/components/auth/session-guard";
import { Toaster } from "sonner";
import { JobToastListener } from "@/components/job-toast-listener";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lantern",
  description: "AI-powered PXE server for automated OS installation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            <SessionGuard>
              <JobToastListener />
              <ConditionalLayout>{children}</ConditionalLayout>
              <Toaster position="bottom-right" richColors closeButton />
            </SessionGuard>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
