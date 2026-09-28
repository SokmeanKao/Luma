import type { Metadata } from 'next';
import { Maven_Pro, Noto_Sans_KR } from 'next/font/google';
import '@luma/ui/tokens.css';
import './globals.css';

const maven = Maven_Pro({
  subsets: ['latin'],
  variable: '--font-maven',
  display: 'swap',
});

const notoKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-kr',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Luma — Live translation',
  description: 'Live English subtitles for meetings and videos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${maven.variable} ${notoKr.variable}`}>{children}</body>
    </html>
  );
}
