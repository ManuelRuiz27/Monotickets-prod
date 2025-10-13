'use client';

import React from 'react';
import { OrganizerRecord } from '@/lib/api/director';
import { colors, typography, spacing } from '@shared/theme';

interface OrganizerTableProps {
  organizers: OrganizerRecord[];
  onSelect: (organizer: OrganizerRecord) => void;
}

export function OrganizerTable({ organizers, onSelect }: OrganizerTableProps) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <caption style={{ fontFamily: typography.subtitle, color: colors.navy, textAlign: 'left', marginBottom: spacing.sm }}>
          Organizadores
        </caption>
        <thead style={{ backgroundColor: colors.neutral }}>
          <tr>
            <th scope="col" style={headerCellStyle}>
              Nombre
            </th>
            <th scope="col" style={headerCellStyle}>
              Correo
            </th>
            <th scope="col" style={headerCellStyle}>
              Plan
            </th>
            <th scope="col" style={headerCellStyle}>
              Tickets
            </th>
            <th scope="col" style={headerCellStyle}>
              Balance
            </th>
            <th scope="col" style={headerCellStyle}>
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {organizers.map((organizer) => (
            <tr key={organizer.id}>
              <td style={cellStyle}>{organizer.name}</td>
              <td style={cellStyle}>{organizer.email}</td>
              <td style={cellStyle}>{organizer.plan}</td>
              <td style={cellStyle}>{organizer.ticketsGenerated}</td>
              <td style={cellStyle}>${organizer.balance.toLocaleString()}</td>
              <td style={cellStyle}>
                <button type="button" onClick={() => onSelect(organizer)}>
                  Gestionar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const headerCellStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  textAlign: 'left',
  padding: `${spacing.xs} ${spacing.sm}`,
};

const cellStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.navy,
  padding: `${spacing.xs} ${spacing.sm}`,
  borderBottom: `1px solid ${colors.neutral}`,
};
