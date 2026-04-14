import type { Metadata } from "next";
import OfflineBootstrap from "./components/offline-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIですか？",
  description:
    "UI prototype for uploading anime images and viewing AI detection results.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <OfflineBootstrap />
        {children}
      </body>
    </html>
  );
}
