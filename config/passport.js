import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';

import prisma from '../lib/prisma.js';

// Same message for "no such user" and "wrong password". Telling them apart
// hands an attacker a username oracle.
const GENERIC_FAILURE = 'Incorrect username or password';

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return done(null, false, { message: GENERIC_FAILURE });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return done(null, false, { message: GENERIC_FAILURE });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    // A deleted user with a live cookie must not crash the app.
    done(null, user ?? null);
  } catch (err) {
    done(err);
  }
});

export default passport;
