import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';

import passport from '../config/passport.js';
import prisma from '../lib/prisma.js';

export function signUpGet(req, res) {
  res.render('auth/sign-up', { username: '', errors: [] });
}

export const signUpValidators = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 32 })
    .withMessage('Username must be 3–32 characters')
    .matches(/^[A-Za-z0-9_-]+$/)
    .withMessage('Username may contain letters, numbers, underscores and hyphens only'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
];

export async function signUpPost(req, res) {
  const result = validationResult(req);
  const username = (req.body.username ?? '').trim();

  // Never re-populate the password fields, only the username.
  if (!result.isEmpty()) {
    return res.status(400).render('auth/sign-up', {
      username,
      errors: result.array(),
    });
  }

  const hashed = await bcrypt.hash(req.body.password, 10);

  try {
    await prisma.user.create({ data: { username, password: hashed } });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).render('auth/sign-up', {
        username,
        errors: [{ msg: 'That username is already taken' }],
      });
    }
    throw err;
  }

  res.redirect('/log-in');
}

export function logInGet(req, res) {
  const errors = (req.session.messages ?? []).map((msg) => ({ msg }));
  req.session.messages = [];
  res.render('auth/log-in', { errors });
}

export const logInPost = passport.authenticate('local', {
  successRedirect: '/drive',
  failureRedirect: '/log-in',
  failureMessage: true,
});

export function logOutPost(req, res, next) {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((destroyErr) => {
      if (destroyErr) return next(destroyErr);
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  });
}
