import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectorModule } from '../src/modules/director.js';

class StubDb {
  constructor() {
    this.ledgerTickets = new Map();
    this.payments = [];
    this.ledgerEntries = [];
    this.paymentCounter = 1;
    this.entryCounter = 1;
  }

  createLedgerTicket(record) {
    const row = {
      id: record.id,
      organizer_id: record.organizerId,
      event_id: record.eventId || null,
      tickets_assigned: record.ticketsAssigned || 0,
      tickets_used: record.ticketsUsed || 0,
      tickets_type: record.ticketsType || 'manual',
      unit_price_mxn: (record.unitPriceMXN ?? 0).toFixed(2),
      amount_due: (record.amountDue ?? 0).toFixed(2),
      paid: Boolean(record.paid),
      payment_ref: record.paymentRef || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.ledgerTickets.set(row.id, row);
    return row;
  }

  query = async (sql, params = []) => {
    const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (text.startsWith('select * from ledger_tickets where id')) {
      const id = params[0];
      const row = this.ledgerTickets.get(id);
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (text.startsWith('select * from ledger_tickets where payment_ref')) {
      const ref = params[0];
      const row = Array.from(this.ledgerTickets.values()).find((item) => item.payment_ref === ref);
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (text.startsWith('insert into ledger_tickets')) {
      const row = this.createLedgerTicket({
        id: `lt-${this.ledgerTickets.size + 1}`,
        organizerId: params[0],
        eventId: params[1],
        ticketsAssigned: 0,
        ticketsType: 'manual',
        unitPriceMXN: 0,
        amountDue: Number(params[2]),
      });
      return { rows: [structuredClone(row)], rowCount: 1 };
    }

    if (text.startsWith('insert into payments')) {
      const id = `pay-${this.paymentCounter += 1}`;
      this.payments.push({
        id,
        event_id: params[0],
        organizer_id: params[1],
        amount_cents: params[2],
        currency: params[3],
        provider: params[5],
        provider_ref: params[6],
      });
      return { rows: [{ id }], rowCount: 1 };
    }

    if (text.startsWith('insert into director_ledger_entries')) {
      const id = `entry-${this.entryCounter += 1}`;
      const row = {
        id,
        organizer_id: params[0],
        event_id: params[1],
        entry_type: 'payment',
        amount_cents: params[2],
        created_at: new Date().toISOString(),
      };
      this.ledgerEntries.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (text.startsWith('update ledger_tickets')) {
      const amountDue = Number(params[0]);
      const paid = params[1];
      const paymentRef = params[2];
      const id = params[3];
      const existing = this.ledgerTickets.get(id);
      if (!existing) {
        return { rows: [], rowCount: 0 };
      }
      existing.amount_due = amountDue.toFixed(2);
      existing.paid = paid;
      if (paymentRef) {
        existing.payment_ref = paymentRef;
      }
      existing.updated_at = new Date().toISOString();
      return { rows: [structuredClone(existing)], rowCount: 1 };
    }

    if (text.includes('from director_ledger_entries')) {
      const assigned = this.ledgerEntries
        .filter((entry) => entry.entry_type !== 'payment')
        .reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0);
      const payments = this.ledgerEntries
        .filter((entry) => entry.entry_type === 'payment')
        .reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0);
      return {
        rows: [
          {
            tickets_equivalent: 0,
            assigned_amount_cents: assigned,
            payments_cents: payments,
          },
        ],
        rowCount: 1,
      };
    }

    if (text.includes('from ledger_tickets') && text.includes('amount_due')) {
      const organizerId = params[0];
      const outstanding = Array.from(this.ledgerTickets.values())
        .filter((ticket) => ticket.organizer_id === organizerId && !ticket.paid)
        .reduce((sum, ticket) => sum + Number(ticket.amount_due), 0);
      return { rows: [{ amount_due: outstanding.toFixed(2) }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  };

  withTransaction = async (fn) => fn({ query: this.query });
}

describe('director payments', () => {
  let db;
  let module;
  const organizerId = 'org-1';
  const ledgerTicketId = 'lt-1';

  beforeEach(() => {
    db = new StubDb();
    db.createLedgerTicket({
      id: ledgerTicketId,
      organizerId,
      amountDue: 1000,
      unitPriceMXN: 0,
      ticketsType: 'prepaid',
      paid: false,
    });
    module = createDirectorModule({
      env: { DIRECTOR_CACHE_DISABLE: 'true', NODE_ENV: 'test' },
      db,
      logger: () => {},
    });
  });

  it('applies a manual payment and closes ledger ticket', async () => {
    const response = await module.recordPayment({
      body: {
        amount: 1000,
        currency: 'mxn',
        organizerId,
        ledgerTicketId,
        paymentRef: 'manual-001',
        method: 'manual',
      },
      requestId: 'req-1',
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.payload.status, 'applied');
    const ticket = db.ledgerTickets.get(ledgerTicketId);
    assert.equal(ticket.paid, true);
    assert.equal(ticket.payment_ref, 'manual-001');
    assert.equal(Number(ticket.amount_due), 0);
  });

  it('returns duplicate when the same payment reference is processed twice', async () => {
    await module.recordPayment({
      body: {
        amount: 1000,
        currency: 'mxn',
        organizerId,
        ledgerTicketId,
        paymentRef: 'dup-ref',
        method: 'manual',
      },
      requestId: 'req-dup-1',
    });

    const response = await module.recordPayment({
      body: {
        amount: 1000,
        currency: 'mxn',
        organizerId,
        ledgerTicketId,
        paymentRef: 'dup-ref',
        method: 'manual',
      },
      requestId: 'req-dup-2',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.status, 'duplicate');
  });

  it('rejects payment when ledger ticket already paid with different reference', async () => {
    await module.recordPayment({
      body: {
        amount: 1000,
        currency: 'mxn',
        organizerId,
        ledgerTicketId,
        paymentRef: 'paid-ref',
        method: 'manual',
      },
      requestId: 'req-paid-1',
    });

    const response = await module.recordPayment({
      body: {
        amount: 1000,
        currency: 'mxn',
        organizerId,
        ledgerTicketId,
        paymentRef: 'new-ref',
        method: 'manual',
      },
      requestId: 'req-paid-2',
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.payload, { error: 'ledger_ticket_already_paid' });
  });
});
