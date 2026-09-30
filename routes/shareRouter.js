import { Router } from 'express';

import * as shares from '../controllers/shareController.js';

// Public: no isAuth anywhere in this router.
const router = Router();

router.get('/:id', shares.viewShare);
router.get('/:id/files/:fileId/download', shares.downloadSharedFile);

export default router;
