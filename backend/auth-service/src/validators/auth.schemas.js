const { z } = require('zod');

const email = z.string().trim().toLowerCase().email('Email is invalid').max(254);

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p) <= 72, 'Password must be at most 72 bytes')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password needs a letter and a digit');

const fullName = z.string().trim().min(1, 'Full name is required').max(100);

const signupSchema = z.object({ email, password, fullName });
const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
const resetRequestSchema = z.object({ email });
const resetConfirmSchema = z.object({ token: z.string().min(1).max(200), newPassword: password });
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

module.exports = {
  email,
  password,
  fullName,
  signupSchema,
  loginSchema,
  resetRequestSchema,
  resetConfirmSchema,
  changePasswordSchema,
};
