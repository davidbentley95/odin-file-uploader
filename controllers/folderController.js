import { body, validationResult } from 'express-validator';

import prisma from '../lib/prisma.js';
import {
  buildBreadcrumbs,
  collectSubtreeStoragePaths,
  resolveOwnedFolderId,
} from '../middleware/resources.js';
import { removeObjects } from '../lib/supabase.js';
import {
  flashErrors,
  readFlashErrors,
  readFlashNotices,
} from '../lib/flash.js';
import { formatSize } from '../lib/format.js';

export const folderNameValidators = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('A folder needs a name')
    .isLength({ max: 255 })
    .withMessage('Folder names are limited to 255 characters')
    .not()
    .contains('/')
    .withMessage('Folder names cannot contain a slash'),
];

// One listing view serves the root and every nested folder.
async function renderListing(req, res, folder) {
  const ownerId = req.user.id;
  const parentId = folder ? folder.id : null;

  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { ownerId, parentId },
      orderBy: { name: 'asc' },
    }),
    prisma.file.findMany({
      where: { ownerId, folderId: parentId },
      orderBy: { name: 'asc' },
    }),
  ]);

  const breadcrumbs = folder ? await buildBreadcrumbs(folder, ownerId) : [];

  res.render('drive/index', {
    title: folder ? folder.name : 'My Drive',
    folder,
    breadcrumbs,
    folders,
    files,
    errors: readFlashErrors(req),
    notices: readFlashNotices(req),
    formatSize,
  });
}

export async function listRoot(req, res) {
  await renderListing(req, res, null);
}

export async function listFolder(req, res) {
  await renderListing(req, res, req.folder);
}

export async function createFolder(req, res) {
  const result = validationResult(req);
  const parentId = await resolveOwnedFolderId(req.body.parentId, req.user.id);

  if (!result.isEmpty()) {
    flashErrors(req, result.array().map((error) => error.msg));
    return res.redirect(parentId ? `/drive/folders/${parentId}` : '/drive');
  }

  await prisma.folder.create({
    data: {
      name: req.body.name.trim(),
      ownerId: req.user.id,
      parentId,
    },
  });

  res.redirect(parentId ? `/drive/folders/${parentId}` : '/drive');
}

export async function renameFolder(req, res) {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    flashErrors(req, result.array().map((error) => error.msg));
    return res.redirect(`/drive/folders/${req.folder.id}`);
  }

  await prisma.folder.update({
    where: { id: req.folder.id },
    data: { name: req.body.name.trim() },
  });

  res.redirect(`/drive/folders/${req.folder.id}`);
}

export async function deleteFolder(req, res) {
  const { parentId } = req.folder;

  // The database cascade removes the subtree's rows but knows nothing about the
  // bucket, so the objects have to be collected and removed first.
  const storagePaths = await collectSubtreeStoragePaths(req.folder.id, req.user.id);
  await removeObjects(storagePaths);

  // onDelete: Cascade on the self-relation removes the whole subtree in one
  // statement — no recursive delete logic here.
  await prisma.folder.delete({ where: { id: req.folder.id } });

  res.redirect(parentId ? `/drive/folders/${parentId}` : '/drive');
}
