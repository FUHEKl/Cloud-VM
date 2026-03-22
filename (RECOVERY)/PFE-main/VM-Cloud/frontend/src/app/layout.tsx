import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
