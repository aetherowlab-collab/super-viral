import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SuperViral Metadata Tester",
  description: "SNS 링크의 메타데이터 추출 가능성을 테스트합니다.",
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
