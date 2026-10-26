import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TripSync — Collaborative Travel & Schedule Sync",
  description:
    "Real-time travel planner that synchronizes flights, hotel check-ins, and flexible daily activities with instant schedule conflict detection and group expense sharing.",
  keywords: [
    "travel planning",
    "trip organizer",
    "itinerary sync",
    "collaborative travel",
    "schedule conflict detection",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="font-sans antialiased min-h-screen bg-[#f8fafc] text-slate-900 selection:bg-slate-900 selection:text-white">
        {children}
      </body>
    </html>
  );
}
