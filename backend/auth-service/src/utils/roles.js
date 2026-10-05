const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin', SYSTEM_ADMIN: 'system_admin' });
const RANK = Object.freeze({ user: 1, admin: 2, system_admin: 3 });

const hasAtLeast = (role, minimum) => (RANK[role] || 0) >= RANK[minimum];

module.exports = { ROLES, RANK, hasAtLeast };
