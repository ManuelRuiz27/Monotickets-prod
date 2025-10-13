import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Monotickets · Invitado',
  description: 'Experiencia de invitado basada en datos de demostración.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
