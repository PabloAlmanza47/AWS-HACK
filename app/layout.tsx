import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Explain Your Build",
  description:
    "Practice explaining your own projects with code-grounded AI interview questions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
