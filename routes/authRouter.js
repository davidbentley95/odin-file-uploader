import { Router } from 'express';

import * as auth from '../controllers/authController.js';

const router = Router();

router.get('/sign-up', auth.signUpGet);
router.post('/sign-up', auth.signUpValidators, auth.signUpPost);

router.get('/log-in', auth.logInGet);
router.post('/log-in', auth.logInPost);

// POST, not GET: a GET log-out can be fired by any <img src> on any page.
router.post('/log-out', auth.logOutPost);

export default router;
