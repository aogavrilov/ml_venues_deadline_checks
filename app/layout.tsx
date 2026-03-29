import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A* Conference Deadline Monitor",
  description: "Conference source registry and ingestion bootstrap for AI research deadlines."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
