import { query } from '../db/index.js';

export async function createPushSubscription({ userId, endpoint, p256dh, auth }) {
  const result = await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, endpoint, p256dh, auth, created_at, deleted_at`,
    [userId, endpoint, p256dh, auth],
  );

  return result.rows[0] ?? null;
}

export async function deletePushSubscription({ userId, subscriptionId }) {
  const result = await query(
    `DELETE FROM push_subscriptions
      WHERE id = $1 AND user_id = $2`,
    [subscriptionId, userId],
  );

  return result.rowCount > 0;
}

export function serializePushSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
  };
}

export const internals = {
  serializePushSubscription,
};
