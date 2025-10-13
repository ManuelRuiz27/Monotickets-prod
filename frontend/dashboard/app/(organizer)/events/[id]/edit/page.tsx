'use client';

import React from 'react';
import Link from 'next/link';
import {
  getEvent,
  updateEvent,
  type EventDetail,
  type LandingKind,
} from '@/lib/api/organizer';
import {
  colors,
  spacing,
  typography,
  cardStyles,
  buttonStyles,
  inputStyles,
  parseStyles,
} from '@shared/theme';

interface PageProps {
  params: { id: string };
}

const cardStyle = parseStyles(cardStyles);
const primaryButton = parseStyles(buttonStyles.primary);
const secondaryButton = parseStyles(buttonStyles.secondary);
const ghostButton = parseStyles(buttonStyles.ghost);
const inputStyle = parseStyles(inputStyles);

interface FormState {
  name: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  type: LandingKind;
  landingUrl: string;
  landingTtlDays: string;
  coverUrl: string;
  pdfUrl: string;
  flipbookUrl: string;
}

const emptyForm: FormState = {
  name: '',
  description: '',
  location: '',
  startsAt: '',
  endsAt: '',
  type: 'standard',
  landingUrl: '',
  landingTtlDays: '30',
  coverUrl: '',
  pdfUrl: '',
  flipbookUrl: '',
};

export default function EditEventPage({ params }: PageProps) {
  const { id } = params;
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [event, setEvent] = React.useState<EventDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const data = await getEvent(id);
        if (cancelled) return;
        setEvent(data);
        setForm({
          name: data.name ?? '',
          description: data.description ?? '',
          location: data.location ?? '',
          startsAt: toInputDateTime(data.startsAt),
          endsAt: data.endsAt ? toInputDateTime(data.endsAt) : '',
          type: data.type ?? 'standard',
          landingUrl: data.landingUrl ?? '',
          landingTtlDays: String(data.landingTtlDays ?? 30),
          coverUrl: data.coverUrl ?? '',
          pdfUrl: data.pdfUrl ?? '',
          flipbookUrl: data.flipbookUrl ?? '',
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'No pudimos cargar el evento.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleChange = (field: keyof FormState) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = async (eventSubmit: React.FormEvent) => {
    eventSubmit.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        location: form.location || undefined,
        startsAt: fromInputDateTime(form.startsAt),
        endsAt: form.endsAt ? fromInputDateTime(form.endsAt) : undefined,
        type: form.type,
        landingUrl: form.landingUrl || undefined,
        landingTtlDays: Number(form.landingTtlDays) || 0,
        coverUrl: form.coverUrl || undefined,
        pdfUrl: form.pdfUrl || undefined,
        flipbookUrl: form.flipbookUrl || undefined,
      };
      const updated = await updateEvent(id, payload);
      setEvent(updated);
      setStatus('Los cambios se guardaron correctamente.');
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos guardar los cambios.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main aria-labelledby="edit-event-title" style={{ padding: spacing.xl }}>
      <header style={headerStyle}>
        <div>
          <h1 id="edit-event-title" style={titleStyle}>
            Editar evento
          </h1>
          <p style={subtitleStyle}>
            Actualiza la información general y la landing sin reemplazar archivos en CDN.
          </p>
        </div>
        <Link href={`/dashboard/events/${id}`} style={{ ...ghostButton, textDecoration: 'none' }}>
          Volver al evento
        </Link>
      </header>
      {loading ? (
        <section style={cardStyle} aria-busy="true">
          <p style={subtitleStyle}>Cargando datos del evento…</p>
        </section>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: spacing.lg }} aria-describedby="edit-event-status">
          <section style={cardStyle}>
            <div style={sectionGrid}>
              <label htmlFor="event-name" style={labelStyle}>
                Nombre del evento
                <input
                  id="event-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={handleChange('name')}
                  style={inputStyle}
                />
              </label>
              <label htmlFor="event-type" style={labelStyle}>
                Tipo
                <select
                  id="event-type"
                  value={form.type}
                  onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as LandingKind }))}
                  style={{ ...inputStyle, appearance: 'auto' }}
                >
                  <option value="standard">Estándar</option>
                  <option value="premium">Premium</option>
                </select>
              </label>
              <label htmlFor="event-location" style={labelStyle}>
                Ubicación
                <input
                  id="event-location"
                  type="text"
                  value={form.location}
                  onChange={handleChange('location')}
                  style={inputStyle}
                />
              </label>
              <label htmlFor="event-start" style={labelStyle}>
                Inicio
                <input
                  id="event-start"
                  type="datetime-local"
                  required
                  value={form.startsAt}
                  onChange={handleChange('startsAt')}
                  style={inputStyle}
                />
              </label>
              <label htmlFor="event-end" style={labelStyle}>
                Fin
                <input
                  id="event-end"
                  type="datetime-local"
                  value={form.endsAt}
                  min={form.startsAt}
                  onChange={handleChange('endsAt')}
                  style={inputStyle}
                />
              </label>
              <label htmlFor="event-ttl" style={labelStyle}>
                Vigencia de landing (días)
                <input
                  id="event-ttl"
                  type="number"
                  min={1}
                  value={form.landingTtlDays}
                  onChange={handleChange('landingTtlDays')}
                  style={inputStyle}
                />
              </label>
            </div>
            <label htmlFor="event-description" style={labelStyle}>
              Descripción
              <textarea
                id="event-description"
                value={form.description}
                onChange={handleChange('description')}
                style={{ ...inputStyle, minHeight: '120px' }}
              />
            </label>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>Enlaces y recursos</h2>
            <p style={helperText}>
              Usa enlaces ya hospedados. Para reemplazar archivos en CDN utiliza el administrador correspondiente.
            </p>
            <div style={sectionGrid}>
              <label htmlFor="event-landing-url" style={labelStyle}>
                Landing pública
                <input
                  id="event-landing-url"
                  type="url"
                  value={form.landingUrl}
                  onChange={handleChange('landingUrl')}
                  style={inputStyle}
                  placeholder="https://"
                />
              </label>
              <label htmlFor="event-cover-url" style={labelStyle}>
                Portada (URL)
                <input
                  id="event-cover-url"
                  type="url"
                  value={form.coverUrl}
                  onChange={handleChange('coverUrl')}
                  style={inputStyle}
                  placeholder="https://"
                />
              </label>
              <label htmlFor="event-pdf-url" style={labelStyle}>
                PDF (URL)
                <input
                  id="event-pdf-url"
                  type="url"
                  value={form.pdfUrl}
                  onChange={handleChange('pdfUrl')}
                  style={inputStyle}
                  placeholder="https://"
                />
              </label>
              <label htmlFor="event-flipbook-url" style={labelStyle}>
                Flipbook (URL)
                <input
                  id="event-flipbook-url"
                  type="url"
                  value={form.flipbookUrl}
                  onChange={handleChange('flipbookUrl')}
                  style={inputStyle}
                  placeholder="https://"
                />
              </label>
            </div>
          </section>

          <div style={actionsStyle}>
            <button type="submit" style={primaryButton} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <Link href={`/dashboard/events/${id}`} style={{ ...secondaryButton, textDecoration: 'none' }}>
              Cancelar
            </Link>
          </div>
          <div id="edit-event-status" aria-live="polite" style={{ minHeight: '1.5rem' }}>
            {status && <p style={successStyle}>{status}</p>}
            {error && <p role="alert" style={errorStyle}>{error}</p>}
          </div>
        </form>
      )}
    </main>
  );
}

function toInputDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (input: number) => input.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromInputDateTime(value: string): string {
  return value ? new Date(value).toISOString() : '';
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: spacing.md,
  marginBottom: spacing.lg,
};

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  fontSize: '2rem',
  color: colors.navy,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  margin: 0,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  marginBottom: spacing.sm,
};

const helperText: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  marginBottom: spacing.md,
};

const sectionGrid: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  marginBottom: spacing.lg,
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.xs,
  fontFamily: typography.body,
  color: colors.navy,
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: spacing.sm,
  flexWrap: 'wrap',
};

const successStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.success,
  margin: 0,
};

const errorStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.danger,
  margin: 0,
};
