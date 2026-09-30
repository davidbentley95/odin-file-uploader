import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';

import passport from './config/passport.js';
import prisma from './lib/prisma.js';
import { createError } from './lib/httpError.js';
import authRouter from './routes/authRouter.js';
import driveRouter from './routes/driveRouter.js';
import shareRouter from './routes/shareRouter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // Render terminates TLS in front of the app; without this the session cookie
  // is never set, because express-session sees a plain http request.
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    },
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 2 * 60 * 1000,
      dbRecordIdIsSessionId: true,
    }),
  }),
);

app.use(passport.session());

app.use((req, res, next) => {
  res.locals.currentUser = req.user ?? null;
  next();
});

app.get('/', (req, res) => {
  res.render('index');
});

app.use(authRouter);
app.use('/drive', driveRouter);
app.use('/share', shareRouter);

app.use((req, res, next) => {
  next(createError(404));
});

// eslint-disable-next-line no-unused-vars -- four arguments make this the error handler
app.use((err, req, res, next) => {
  const status = err.status ?? 500;

  if (status >= 500) {
    console.error(err);
  }

  if (status === 404) {
    return res.status(404).render('404');
  }

  res.status(status).render('error', {
    status,
    message: isProduction && status >= 500 ? 'Something went wrong.' : err.message,
  });
});

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
