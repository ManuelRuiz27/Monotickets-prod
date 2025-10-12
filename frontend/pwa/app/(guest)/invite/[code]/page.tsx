import type React from 'react';
import { notFound } from 'next/navigation';
import { getInviteLanding } from '../../../lib/api/guest';
import { themeToStyle } from '../../../lib/theme/overrides';
import { HeroCover } from './_components/HeroCover';

interface PageProps {
  params: { code: string };
}

export default async function InviteLandingPage({ params }: PageProps) {
  const { code } = params;
  const invite = await getInviteLanding(code).catch(() => null);

  if (!invite) {
    notFound();
  }

  const themeStyle = themeToStyle(invite.theme);

  return (
    <div style={{ ...surfaceBase, ...themeStyle }}>
      <HeroCover event={invite.event} guest={invite.guest} detailsHref="./details" />
    </div>
  );
}

const surfaceBase: React.CSSProperties = {
  minHeight: '100vh',
  fontFamily: 'var(--guest-font-body)',
  color: 'var(--guest-color-text)',
  backgroundColor: 'var(--guest-color-background)',
};
