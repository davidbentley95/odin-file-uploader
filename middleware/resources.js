import prisma from '../lib/prisma.js';
import { createError } from '../lib/httpError.js';

// A non-numeric id must 404, not reach Prisma and throw a validation error.
function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Both loaders 404 on a mismatch rather than 403. Telling someone a resource
// exists but isn't theirs is itself a leak.
export async function loadFolder(req, res, next) {
  const id = parseId(req.params.id);
  if (id === null) return next(createError(404));

  const folder = await prisma.folder.findFirst({
    where: { id, ownerId: req.user.id },
  });
  if (!folder) return next(createError(404));

  req.folder = folder;
  next();
}

export async function loadFile(req, res, next) {
  const id = parseId(req.params.id);
  if (id === null) return next(createError(404));

  const file = await prisma.file.findFirst({
    where: { id, ownerId: req.user.id },
    include: { folder: true },
  });
  if (!file) return next(createError(404));

  // Not `req.file` — that name belongs to multer on upload routes.
  req.fileRecord = file;
  next();
}

// Used by folder creation and upload: a parent id from the request body is only
// acceptable if that folder belongs to the current user. Returns undefined for
// "no parent given", null for "root", or throws a 404.
export async function resolveOwnedFolderId(rawId, ownerId) {
  if (rawId === undefined || rawId === null || rawId === '') return null;

  const id = parseId(rawId);
  if (id === null) throw createError(404);

  const folder = await prisma.folder.findFirst({
    where: { id, ownerId },
    select: { id: true },
  });
  if (!folder) throw createError(404);

  return folder.id;
}

// Walk up the parentId chain. Capped as a cycle guard — a recursive CTE would
// be faster but this tree is a handful of levels deep in practice.
export async function buildBreadcrumbs(folder, ownerId) {
  const crumbs = [];
  let current = folder;

  for (let hops = 0; current && hops < 50; hops += 1) {
    crumbs.push({ id: current.id, name: current.name });
    if (current.parentId === null) break;
    current = await prisma.folder.findFirst({
      where: { id: current.parentId, ownerId },
      select: { id: true, name: true, parentId: true },
    });
  }

  return crumbs.reverse();
}

// Collect every storagePath in a folder's subtree, level by level. The tree can
// be arbitrarily deep, so this is an iterative breadth-first walk rather than
// recursion — and a plain query per level rather than a recursive CTE.
export async function collectSubtreeStoragePaths(folderId, ownerId) {
  const paths = [];
  let level = [folderId];

  for (let depth = 0; level.length && depth < 50; depth += 1) {
    const [files, children] = await Promise.all([
      prisma.file.findMany({
        where: { ownerId, folderId: { in: level } },
        select: { storagePath: true },
      }),
      prisma.folder.findMany({
        where: { ownerId, parentId: { in: level } },
        select: { id: true },
      }),
    ]);

    paths.push(...files.map((file) => file.storagePath));
    level = children.map((child) => child.id);
  }

  return paths;
}
