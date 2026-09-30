import { Router } from 'express';

import { isAuth } from '../middleware/auth.js';
import { loadFile, loadFolder } from '../middleware/resources.js';
import * as folders from '../controllers/folderController.js';
import * as files from '../controllers/fileController.js';
import * as shares from '../controllers/shareController.js';
import { upload } from '../config/multer.js';

const router = Router();

// Everything under /drive requires a session.
router.use(isAuth);

router.get('/', folders.listRoot);

router.get('/folders/:id', loadFolder, folders.listFolder);
router.post('/folders', folders.folderNameValidators, folders.createFolder);
router.post(
  '/folders/:id/rename',
  loadFolder,
  folders.folderNameValidators,
  folders.renameFolder,
);
router.post('/folders/:id/delete', loadFolder, folders.deleteFolder);
router.post(
  '/folders/:id/share',
  loadFolder,
  shares.shareValidators,
  shares.createShare,
);

// The multer error handler must sit immediately after the multer middleware,
// otherwise a rejected upload 500s instead of showing a message.
router.post(
  '/upload',
  upload.single('file'),
  files.uploadErrorHandler,
  files.uploadFile,
);

router.get('/files/:id', loadFile, files.fileDetails);
router.get('/files/:id/download', loadFile, files.downloadFile);
router.post('/files/:id/delete', loadFile, files.deleteFile);

export default router;
