import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "슈퍼바이럴 — SNS 콘텐츠 응급진단 V-CARE",
  description: "YouTube Shorts, Instagram Reels, TikTok 콘텐츠의 바이럴 병목을 30초 만에 진단하고 처방전을 받아보세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
