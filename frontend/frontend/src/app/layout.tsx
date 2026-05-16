import type { Metadata } from "next";
import AuthRedirectListener from "@/components/auth/AuthRedirectListener";
import "./globals.css";

export const metadata: Metadata = {
  title: "CloudVM — Virtual Lab Cloud",
  description: "Deploy and manage virtual machines & databases in the cloud",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthRedirectListener />
        {children}
      </body>
    </html>
  );
}
