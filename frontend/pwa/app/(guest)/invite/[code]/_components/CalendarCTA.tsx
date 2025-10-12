import type React from 'react';

interface CalendarCTAProps {
  eventTitle: string;
  startDate: string;
  endDate?: string;
  timezone?: string;
  location?: string;
  description?: string;
}

export function CalendarCTA({
  eventTitle,
  startDate,
  endDate,
  timezone,
  location,
  description,
}: CalendarCTAProps) {
  const fallbackEnd = endDate ?? new Date(new Date(startDate).getTime() + parseDuration('PT02H')).toISOString();
  const startIso = formatCalendarDate(startDate);
  const endIso = formatCalendarDate(fallbackEnd);
  const googleHref = buildGoogleLink(eventTitle, startIso, endIso, location, description);
  const outlookHref = buildOutlookLink(eventTitle, startDate, fallbackEnd, location, description);
  const icsContent = createIcs(eventTitle, startDate, fallbackEnd, location, description, timezone);
  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;

  return (
    <section style={wrapperStyle} aria-labelledby="calendar-cta-heading">
      <h2 id="calendar-cta-heading" style={headingStyle}>
        Agregar a tu calendario
      </h2>
      <p style={descriptionStyle}>
        Guarda la fecha en tu calendario favorito. Todos los enlaces se abren en una pestaña nueva.
      </p>
      <div style={buttonGroupStyle}>
        <a href={googleHref} target="_blank" rel="noreferrer" style={primaryButtonStyle}>
          Google Calendar
        </a>
        <a href={outlookHref} target="_blank" rel="noreferrer" style={secondaryButtonStyle}>
          Outlook / Office 365
        </a>
        <a href={icsHref} download={`${sanitizeFileName(eventTitle)}.ics`} style={secondaryButtonStyle}>
          Descargar .ics (Apple)
        </a>
      </div>
    </section>
  );
}

function buildGoogleLink(
  title: string,
  start: string,
  end: string,
  location?: string,
  description?: string
) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
  });
  if (location) params.set('location', location);
  if (description) params.set('details', description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildOutlookLink(
  title: string,
  start: string,
  end: string,
  location?: string,
  description?: string
) {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: new Date(start).toISOString(),
    enddt: new Date(end).toISOString(),
  });
  if (location) params.set('location', location);
  if (description) params.set('body', description);
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function formatCalendarDate(date: string, durationIso?: string) {
  if (durationIso) {
    const start = new Date(date);
    const end = new Date(start.getTime() + parseDuration(durationIso));
    return end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }
  return new Date(date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function parseDuration(isoDuration: string) {
  const match = /P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/.exec(isoDuration);
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600000 + minutes * 60000 + seconds * 1000;
}

function createIcs(
  title: string,
  start: string,
  end?: string,
  location?: string,
  description?: string,
  timezone?: string
) {
  const dtStart = formatIcsDate(start);
  const dtEnd = formatIcsDate(end ?? start);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Monotickets//Guest Invite//ES',
    'BEGIN:VEVENT',
    `UID:${randomId()}@monotickets`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART${timezone ? `;TZID=${timezone}` : ''}:${dtStart}`,
    `DTEND${timezone ? `;TZID=${timezone}` : ''}:${dtEnd}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];
  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }
  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function formatIcsDate(date: string) {
  return new Date(date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcsText(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, '-');
}

const wrapperStyle: React.CSSProperties = {
  padding: '24px',
  borderRadius: '16px',
  background: 'rgba(255,255,255,0.85)',
  boxShadow: '0 10px 24px rgba(13,27,42,0.12)',
  display: 'grid',
  gap: '16px',
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--guest-font-heading)',
  fontSize: '1.5rem',
};

const descriptionStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--guest-font-body)',
  color: 'rgba(13,27,42,0.7)',
};

const buttonGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
};

const primaryButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--guest-color-primary)',
  color: '#fff',
  padding: '12px 20px',
  borderRadius: '12px',
  fontFamily: 'var(--guest-font-heading)',
  textDecoration: 'none',
  fontWeight: 600,
};

const secondaryButtonStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  border: '2px solid var(--guest-color-primary)',
  color: 'var(--guest-color-primary)',
  padding: '12px 20px',
  borderRadius: '12px',
  fontFamily: 'var(--guest-font-heading)',
  textDecoration: 'none',
  fontWeight: 600,
};
