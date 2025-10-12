import type React from 'react';
import { notFound } from 'next/navigation';
import { getInvite } from '../../../../lib/api/guest';
import { themeToStyle } from '../../../../lib/theme/overrides';
import { EventInfo } from '../_components/EventInfo';

interface PageProps {
  params: { code: string };
}

export default async function InviteDetailsPage({ params }: PageProps) {
  const { code } = params;
  const invite = await getInvite(code).catch(() => null);

  if (!invite) {
    notFound();
  }

  return (
    <div style={{ ...surfaceBase, ...themeToStyle(invite.theme) }}>
      <EventInfo
        event={invite.event}
        guest={invite.guest}
        template={invite.template}
        templateLinks={invite.templateLinks}
        qrHref="../qr"
      />
    </div>
  );
}

const surfaceBase: React.CSSProperties = {
  minHeight: '100vh',
  padding: '32px 0',
  fontFamily: 'var(--guest-font-body)',
  color: 'var(--guest-color-text)',
  backgroundColor: 'var(--guest-color-background)',
};
