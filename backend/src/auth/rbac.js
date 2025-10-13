const ACTIONS = Object.freeze({
  DELIVER_SEND: 'deliver:send',
  DELIVER_STATUS: 'deliver:status',
  DELIVER_LEGACY_SEND: 'deliver:legacySend',
  DIRECTOR_ASSIGN: 'director:assign',
  DIRECTOR_OVERVIEW: 'director:overview',
  DIRECTOR_LEDGER: 'director:ledger',
  DIRECTOR_PAYMENTS: 'director:payments',
  PAYMENTS_CREATE_INTENT: 'payments:createIntent',
  GUESTS_LIST: 'guests:list',
  EVENT_GUESTS_LIST: 'events:guests:list',
  SCAN_VALIDATE: 'scan:validate',
});

const ROLE_PERMISSIONS = new Map([
  ['admin', new Set(['*'])],
  [
    'organizer',
    new Set([
      ACTIONS.DELIVER_SEND,
      ACTIONS.DELIVER_STATUS,
      ACTIONS.DELIVER_LEGACY_SEND,
      ACTIONS.PAYMENTS_CREATE_INTENT,
      ACTIONS.GUESTS_LIST,
      ACTIONS.EVENT_GUESTS_LIST,
    ]),
  ],
  [
    'staff',
    new Set([
      ACTIONS.DELIVER_STATUS,
      ACTIONS.GUESTS_LIST,
      ACTIONS.EVENT_GUESTS_LIST,
      ACTIONS.SCAN_VALIDATE,
    ]),
  ],
  ['viewer', new Set()],
]);

const KNOWN_ACTIONS = new Set(Object.values(ACTIONS));
const ACTION_ROLE_CACHE = new Map();

function computeAllowedRoles(action) {
  if (!KNOWN_ACTIONS.has(action)) {
    return [];
  }

  if (!ACTION_ROLE_CACHE.has(action)) {
    const aggregated = new Set();
    for (const [role, permissions] of ROLE_PERMISSIONS.entries()) {
      if (permissions.has('*') || permissions.has(action)) {
        aggregated.add(role);
      }
    }
    ACTION_ROLE_CACHE.set(action, Array.from(aggregated).sort());
  }

  return ACTION_ROLE_CACHE.get(action);
}

export function getAllowedRoles(action) {
  return [...computeAllowedRoles(action)];
}

export function isActionAllowed({ role, action }) {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS.get(role);
  if (!permissions) return false;
  if (permissions.has('*')) return true;
  return permissions.has(action);
}

export function authorizeAction({ auth, action }) {
  const allowedRoles = getAllowedRoles(action);
  if (!allowedRoles.length) {
    return {
      allowed: false,
      status: 500,
      reason: 'action_not_configured',
      allowedRoles,
    };
  }

  if (!auth?.user) {
    return {
      allowed: false,
      status: 401,
      reason: auth?.error || 'unauthorized',
      allowedRoles,
    };
  }

  if (isActionAllowed({ role: auth.user.role, action })) {
    return {
      allowed: true,
      status: 200,
      reason: null,
      allowedRoles,
    };
  }

  return {
    allowed: false,
    status: 403,
    reason: 'forbidden',
    allowedRoles,
  };
}

export const RBAC = {
  ACTIONS,
  ROLE_PERMISSIONS,
};
