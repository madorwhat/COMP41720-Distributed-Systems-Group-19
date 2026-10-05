const crypto = require('crypto');

// A long random string (32 random bytes) that is safe to put in a URL or cookie.
// Used for refresh tokens and password-reset tokens.
const randomToken = () => crypto.randomBytes(32).toString('base64url');

// We store only the SHA-256 hash of each token, never the token itself.
// (A slow hash like bcrypt is only needed for passwords; random tokens are too long to guess.)
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

module.exports = { randomToken, sha256 };
