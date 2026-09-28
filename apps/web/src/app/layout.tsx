import type { Metadata } from 'next';
import { Maven_Pro, Noto_Sans_KR, Noto_Sans_Khmer } from 'next/font/google';
import '@luma/ui/tokens.css';
import './globals.css';
import { cn } from '@/lib/utils';

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

const notoKhmer = Noto_Sans_Khmer({
  subsets: ['khmer'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-khmer',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Luma — Live translation',
  description: 'Live English subtitles for meetings and videos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn(maven.variable, notoKr.variable, notoKhmer.variable, 'font-sans')}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
