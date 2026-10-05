// Walks the permission matrix (plan section 6.5): one test per (action, role) cell.
const {
  app,
  request,
  PASSWORD,
  uniqueEmail,
  createUser,
  createUserAndLogin,
  bearer,
} = require('./helpers');

const actors = {};
beforeAll(async () => {
  for (const role of ['user', 'admin', 'system_admin']) {
    actors[role] = await createUserAndLogin({ role });
  }
});

// Each action builds its own fresh target, so cells don't affect each other.
const actions = {
  'view own profile': (token) => request(app).get('/auth/me').set(bearer(token)),
  'list users': (token) => request(app).get('/admin/users').set(bearer(token)),
  'view a user': async (token) => {
    const target = await createUser();
    return request(app).get(`/admin/users/${target.id}`).set(bearer(token));
  },
  'disable a user': async (token) => {
    const target = await createUser();
    return request(app)
      .patch(`/admin/users/${target.id}/status`)
      .set(bearer(token))
      .send({ isActive: false });
  },
  'enable a user': async (token) => {
    const target = await createUser({ isActive: false });
    return request(app)
      .patch(`/admin/users/${target.id}/status`)
      .set(bearer(token))
      .send({ isActive: true });
  },
  'disable an admin': async (token) => {
    const target = await createUser({ role: 'admin' });
    return request(app)
      .patch(`/admin/users/${target.id}/status`)
      .set(bearer(token))
      .send({ isActive: false });
  },
  'create an admin': (token) =>
    request(app)
      .post('/admin/admins')
      .set(bearer(token))
      .send({ email: uniqueEmail('new'), password: PASSWORD, fullName: 'New Admin' }),
  'promote user to admin': async (token) => {
    const target = await createUser();
    return request(app)
      .patch(`/admin/users/${target.id}/role`)
      .set(bearer(token))
      .send({ role: 'admin' });
  },
  'demote admin to user': async (token) => {
    const target = await createUser({ role: 'admin' });
    return request(app)
      .patch(`/admin/users/${target.id}/role`)
      .set(bearer(token))
      .send({ role: 'user' });
  },
  'demote a system admin': async (token) => {
    const target = await createUser({ role: 'system_admin' });
    return request(app)
      .patch(`/admin/users/${target.id}/role`)
      .set(bearer(token))
      .send({ role: 'user' });
  },
  'disable a system admin': async (token) => {
    const target = await createUser({ role: 'system_admin' });
    return request(app)
      .patch(`/admin/users/${target.id}/status`)
      .set(bearer(token))
      .send({ isActive: false });
  },
  'make someone a system admin': async (token) => {
    const target = await createUser();
    return request(app)
      .patch(`/admin/users/${target.id}/role`)
      .set(bearer(token))
      .send({ role: 'system_admin' });
  },
};

// prettier-ignore
const matrix = [
  // action                        user  admin  system_admin
  ['view own profile',             200,  200,   200],
  ['list users',                   403,  200,   200],
  ['view a user',                  403,  200,   200],
  ['disable a user',               403,  200,   200],
  ['enable a user',                403,  200,   200],
  ['disable an admin',             403,  403,   200],
  ['create an admin',              403,  403,   201],
  ['promote user to admin',        403,  403,   200],
  ['demote admin to user',         403,  403,   200],
  ['demote a system admin',        403,  403,   403],
  ['disable a system admin',       403,  403,   403],
  ['make someone a system admin',  403,  403,   400], // not even a valid role value for the API
];

const cells = matrix.flatMap(([action, ...statuses]) =>
  ['user', 'admin', 'system_admin'].map((role, i) => [action, role, statuses[i]]),
);

test.each(cells)('%s as %s -> %i', async (action, role, expected) => {
  const res = await actions[action](actors[role].accessToken);
  expect(res.status).toBe(expected);
});
