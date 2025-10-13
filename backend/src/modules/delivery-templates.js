const TEMPLATE_DEFINITIONS = {
  event_invitation: {
    whatsapp: {
      bodyVariables: ['guestName', 'eventName', 'eventDate'],
    },
    email: {
      subject: 'Invitación a {{eventName}}',
      html: [
        '<p>Hola {{guestName}},</p>',
        '<p>Estás invitad@ a {{eventName}}.</p>',
        '<p>{{eventDate}}</p>',
      ].join(''),
    },
  },
  rsvp_confirm: {
    whatsapp: {
      bodyVariables: ['guestName', 'eventName'],
    },
    email: {
      subject: 'Confirmación RSVP · {{eventName}}',
      html: [
        '<p>Hola {{guestName}},</p>',
        '<p>Tu asistencia para {{eventName}} quedó confirmada.</p>',
        '<p>¡Gracias por confirmar!</p>',
      ].join(''),
    },
  },
};

export function normalizeDeliveryPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { vars: {} };
  }
  const clone = JSON.parse(JSON.stringify(payload));
  clone.vars = normalizeTemplateVars(clone.vars);
  return clone;
}

export function normalizeTemplateVars(vars) {
  if (!vars || typeof vars !== 'object') {
    return {};
  }
  const normalized = {};
  for (const [key, value] of Object.entries(vars)) {
    if (!key) continue;
    if (value === null || value === undefined) continue;
    normalized[key] = typeof value === 'string' ? value : String(value);
  }
  return normalized;
}

export function buildTemplateVars({ template, baseVars, guest, event }) {
  const normalized = normalizeTemplateVars(baseVars);
  const defaults = {
    guestName: guest?.name || normalized.guestName || '',
    eventName: event?.name || normalized.eventName || '',
    eventDate: deriveEventDate(event) || normalized.eventDate || '',
  };
  return { ...defaults, ...normalized };
}

function deriveEventDate(event) {
  if (!event) return '';
  const raw = event.starts_at || event.startsAt || event.start_date || event.startDate;
  if (!raw) return '';
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return raw;
    }
    return date.toLocaleString('es-MX', { hour12: false });
  } catch {
    return raw;
  }
}

export function buildWhatsappComponentsFromVars(template, vars) {
  const definition = TEMPLATE_DEFINITIONS[template]?.whatsapp;
  const components = [];
  const parameters = [];
  const variableOrder = Array.isArray(definition?.bodyVariables) ? definition.bodyVariables : Object.keys(vars).sort();
  for (const key of variableOrder) {
    if (vars[key] === undefined) continue;
    parameters.push({ type: 'text', text: String(vars[key]) });
  }
  if (parameters.length > 0) {
    components.push({ type: 'body', parameters });
  }
  return components;
}

export function buildEmailContentFromTemplate({ template, vars, payload }) {
  const definition = TEMPLATE_DEFINITIONS[template]?.email || {};
  const subjectTemplate = payload?.subjectTemplate || definition.subject;
  const bodyTemplate = payload?.htmlTemplate || definition.html;
  const subject = subjectTemplate ? renderTemplateString(subjectTemplate, vars) : payload?.subject || definition.subject || '';
  const html = bodyTemplate ? renderTemplateString(bodyTemplate, vars) : payload?.html || definition.html || '';
  return {
    subject: subject || payload?.subject || 'Actualización de tu evento',
    html: html || payload?.html || `<p>${vars.eventName || 'Evento'}</p>`,
  };
}

export function renderTemplateString(template, vars) {
  if (typeof template !== 'string') {
    return '';
  }
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    if (vars && Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    return '';
  });
}
