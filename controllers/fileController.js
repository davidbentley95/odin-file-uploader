import multer from 'multer';

import prisma from '../lib/prisma.js';
import { resolveOwnedFolderId } from '../middleware/resources.js';
import { flashErrors } from '../lib/flash.js';
import { formatDate, formatSize } from '../lib/format.js';
import { MAX_FILE_SIZE } from '../config/multer.js';
import {
  buildObjectPath,
  createSignedUrl,
  removeObjects,
  uploadObject,
} from '../lib/supabase.js';

function listingUrl(folderId) {
  return folderId ? `/drive/folders/${folderId}` : '/drive';
}

export async function uploadFile(req, res) {
  const folderId = await resolveOwnedFolderId(req.body.folderId, req.user.id);

  if (!req.file) {
    flashErrors(req, ['Choose a file to upload']);
    return res.redirect(listingUrl(folderId));
  }

  // Storage first, database second. If the upload fails there is no row and
  // nothing to clean up; the reverse order leaves rows pointing at nothing.
  const storagePath = buildObjectPath(req.user.id, req.file.originalname);
  await uploadObject(req.file.buffer, storagePath, req.file.mimetype);

  await prisma.file.create({
    data: {
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      storagePath,
      ownerId: req.user.id,
      folderId,
    },
  });

  res.redirect(listingUrl(folderId));
}

// Sits immediately after the multer middleware on the upload route. Oversized
// files arrive as MulterError; fileFilter rejections as ordinary errors. Neither
// may reach the user as a 500.
// eslint-disable-next-line no-unused-vars -- four arguments make this an error handler
export function uploadErrorHandler(err, req, res, next) {
  const megabytes = Math.round(MAX_FILE_SIZE / (1024 * 1024));

  const message =
    err instanceof multer.MulterError
      ? err.code === 'LIMIT_FILE_SIZE'
        ? `That file is larger than the ${megabytes} MB limit`
        : `Upload failed: ${err.message}`
      : err.message;

  flashErrors(req, [message]);

  // req.body may be unparsed when multer aborts early, so fall back to the root.
  const rawFolderId = Number(req.body?.folderId);
  res.redirect(
    Number.isInteger(rawFolderId) && rawFolderId > 0
      ? `/drive/folders/${rawFolderId}`
      : '/drive',
  );
}


export async function deleteFile(req, res) {
  const { folderId, storagePath } = req.fileRecord;

  // Row first, object second. An orphaned object costs storage; an orphaned row
  // shows the user a file whose download 404s.
  await prisma.file.delete({ where: { id: req.fileRecord.id } });
  await removeObjects([storagePath]);

  res.redirect(listingUrl(folderId));
}

export function fileDetails(req, res) {
  res.render('drive/file', {
    title: req.fileRecord.name,
    file: req.fileRecord,
    formatSize,
    formatDate,
  });
}

const DOWNLOAD_URL_TTL_SECONDS = 60;

// The file is never proxied through this server: the browser is redirected to a
// short-lived signed URL, which is generated per request and never stored.
export async function downloadFile(req, res) {
  const url = await createSignedUrl(
    req.fileRecord.storagePath,
    DOWNLOAD_URL_TTL_SECONDS,
    req.fileRecord.name,
  );
  res.redirect(url);
}
