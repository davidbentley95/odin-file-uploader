import { body, validationResult } from 'express-validator';

import prisma from '../lib/prisma.js';
import { createError } from '../lib/httpError.js';
import { createSignedUrl } from '../lib/supabase.js';
import { flashErrors, flashNotices } from '../lib/flash.js';
import { formatSize } from '../lib/format.js';

const ALLOWED_DURATIONS = ['1', '7', '30'];
const DOWNLOAD_URL_TTL_SECONDS = 60;

export const shareValidators = [
  body('days')
    .isIn(ALLOWED_DURATIONS)
    .withMessage('Choose a share duration of 1, 7 or 30 days'),
];

export async function createShare(req, res) {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    flashErrors(req, result.array().map((error) => error.msg));
    return res.redirect(`/drive/folders/${req.folder.id}`);
  }

  const days = Number(req.body.days);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const share = await prisma.share.create({
    data: { folderId: req.folder.id, expiresAt },
  });

  flashNotices(req, [
    `Share link: /share/${share.id} — expires ${expiresAt.toDateString()}`,
  ]);
  res.redirect(`/drive/folders/${req.folder.id}`);
}

// One 404 for "no such share" and "expired share" alike: an expired link should
// not confirm it ever existed.
async function loadLiveShare(id) {
  const share = await prisma.share.findFirst({
    where: { id, expiresAt: { gt: new Date() } },
    include: { folder: true },
  });
  if (!share) throw createError(404);
  return share;
}

// Without this check, /share/<id>?folder=999 exposes every folder in the
// database. The target must be the shared folder itself or sit beneath it, and
// the whole walk stays inside the share owner's tree.
async function resolveSharedFolder(share, rawFolderId) {
  if (rawFolderId === undefined || rawFolderId === '') return share.folder;

  const id = Number(rawFolderId);
  if (!Number.isInteger(id) || id <= 0) throw createError(404);
  if (id === share.folderId) return share.folder;

  const ownerId = share.folder.ownerId;
  const target = await prisma.folder.findFirst({ where: { id, ownerId } });
  if (!target) throw createError(404);

  let current = target;
  for (let hops = 0; hops < 50; hops += 1) {
    if (current.parentId === null) break;
    if (current.parentId === share.folderId) return target;
    current = await prisma.folder.findFirst({
      where: { id: current.parentId, ownerId },
      select: { id: true, parentId: true },
    });
    if (!current) break;
  }

  throw createError(404);
}

// Breadcrumbs stop at the shared folder — the ancestors above it are not shared.
async function buildSharedBreadcrumbs(share, folder) {
  const crumbs = [];
  let current = folder;

  for (let hops = 0; current && hops < 50; hops += 1) {
    crumbs.push({ id: current.id, name: current.name });
    if (current.id === share.folderId || current.parentId === null) break;
    current = await prisma.folder.findFirst({
      where: { id: current.parentId, ownerId: share.folder.ownerId },
      select: { id: true, name: true, parentId: true },
    });
  }

  return crumbs.reverse();
}

export async function viewShare(req, res) {
  const share = await loadLiveShare(req.params.id);
  const folder = await resolveSharedFolder(share, req.query.folder);
  const ownerId = share.folder.ownerId;

  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { ownerId, parentId: folder.id },
      orderBy: { name: 'asc' },
    }),
    prisma.file.findMany({
      where: { ownerId, folderId: folder.id },
      orderBy: { name: 'asc' },
    }),
  ]);

  res.render('share/index', {
    title: `Shared: ${share.folder.name}`,
    share,
    folder,
    breadcrumbs: await buildSharedBreadcrumbs(share, folder),
    folders,
    files,
    formatSize,
  });
}

export async function downloadSharedFile(req, res) {
  const share = await loadLiveShare(req.params.id);

  const fileId = Number(req.params.fileId);
  if (!Number.isInteger(fileId) || fileId <= 0) throw createError(404);

  const file = await prisma.file.findFirst({
    where: { id: fileId, ownerId: share.folder.ownerId },
  });
  if (!file || file.folderId === null) throw createError(404);

  // Re-run the descendant check: the file's folder must be inside the share.
  await resolveSharedFolder(share, String(file.folderId));

  const url = await createSignedUrl(
    file.storagePath,
    DOWNLOAD_URL_TTL_SECONDS,
    file.name,
  );
  res.redirect(url);
}
