// Everything to do with tokens:
// - access token: a signed JWT (valid 15 min) that the frontend sends with every request.
// - refresh token: a random string (valid 7 days) kept in a cookie, used to get new access tokens.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { RefreshToken } = require('../db');
const { randomToken, sha256 } = require('../utils/crypto');

const { privateKey, publicKey, issuer, audience, accessTokenTtl } = config.jwt;

// A short id for our key (`kid`), put in every token, so a key can be replaced later
// without breaking tokens signed with the old one.
const kid = sha256(publicKey).slice(0, 16);

function signAccessToken(user) {
  return jwt.sign({ role: user.role, tv: user.tokenVersion }, privateKey, {
    algorithm: 'RS256',
    keyid: kid,
    expiresIn: accessTokenTtl,
    issuer,
    audience,
    subject: user.id,
    jwtid: crypto.randomUUID(),
  });
}

// Checks the signature, expiry, issuer and audience. Only RS256 is accepted, so a forged token
// can't trick us by claiming a different (weaker or no) signing method.
function verifyAccessToken(token) {
  return jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer, audience });
}

function publicJwk() {
  const jwk = crypto.createPublicKey(publicKey).export({ format: 'jwk' });
  return { ...jwk, kid, alg: 'RS256', use: 'sig' };
}

// Creates a new refresh token. Returns the token itself (for the cookie) and the database row,
// which stores only its hash.
async function issueRefreshToken(user, { userAgent, ip } = {}, transaction) {
  const raw = randomToken();
  const row = await RefreshToken.create(
    {
      userId: user.id,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000),
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
      ip,
    },
    { transaction },
  );
  return { raw, row };
}

const findRefreshToken = (raw) => RefreshToken.findOne({ where: { tokenHash: sha256(raw) } });

// Marks an old refresh token as used. The update only succeeds if the token isn't already used,
// so if two requests try to use the same token at the same moment, only one of them wins.
// Returns true if this request won.
async function markRotated(oldToken, newTokenId, transaction) {
  const [affected] = await RefreshToken.update(
    { revokedAt: new Date(), replacedById: newTokenId },
    { where: { id: oldToken.id, revokedAt: null }, transaction },
  );
  return affected === 1;
}

async function revokeRefreshToken(raw) {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { tokenHash: sha256(raw), revokedAt: null } },
  );
}

// Logs the user out on every device: cancels all their refresh tokens and increases their
// tokenVersion, which makes every access token already handed out invalid too.
async function revokeAllSessions(user, transaction) {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId: user.id, revokedAt: null }, transaction },
  );
  await user.update({ tokenVersion: user.tokenVersion + 1 }, { transaction });
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  publicJwk,
  issueRefreshToken,
  findRefreshToken,
  markRotated,
  revokeRefreshToken,
  revokeAllSessions,
};
