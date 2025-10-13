import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  normalizeDeliveryPayload,
  buildTemplateVars,
  buildWhatsappComponentsFromVars,
  buildEmailContentFromTemplate,
} from '../src/modules/delivery-templates.js';

test('normalizeDeliveryPayload returns clone with normalized vars', () => {
  const payload = { vars: { guestName: ' Ana ', seats: 2 }, extra: 'value' };
  const normalized = normalizeDeliveryPayload(payload);
  assert.notStrictEqual(normalized, payload);
  assert.deepEqual(normalized.vars, { guestName: ' Ana ', seats: '2' });
  assert.equal(normalized.extra, 'value');
});

test('buildTemplateVars prioritizes explicit vars', () => {
  const vars = buildTemplateVars({
    template: 'rsvp_confirm',
    baseVars: { guestName: 'Ana', eventName: 'Boda 2025' },
    guest: { name: 'Anita' },
    event: { name: 'Fiesta', starts_at: '2025-01-01T20:00:00Z' },
  });
  assert.equal(vars.guestName, 'Ana');
  assert.equal(vars.eventName, 'Boda 2025');
  assert.ok(vars.eventDate); // derived string
});

test('buildWhatsappComponentsFromVars creates ordered components', () => {
  const components = buildWhatsappComponentsFromVars('event_invitation', {
    guestName: 'Ana',
    eventName: 'Boda',
    eventDate: 'Mayo 2025',
  });
  assert.equal(components.length, 1);
  assert.equal(components[0].type, 'body');
  assert.deepEqual(components[0].parameters.map((item) => item.text), ['Ana', 'Boda', 'Mayo 2025']);
});

test('buildEmailContentFromTemplate renders template placeholders', () => {
  const content = buildEmailContentFromTemplate({
    template: 'rsvp_confirm',
    vars: { guestName: 'Ana', eventName: 'Boda 2025' },
    payload: {},
  });
  assert.ok(content.subject.includes('Boda 2025'));
  assert.ok(content.html.includes('Ana'));
});
