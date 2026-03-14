import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Propel - Energy Route Planner",
  description:
    "Find the cheapest fuel and EV charging stations along your route. Real-time prices, smart detour calculations, and range-aware recommendations.",
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
