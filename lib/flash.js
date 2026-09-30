// Validation failures on the drive POSTs redirect back to a listing, so their
// messages have to survive exactly one hop in the session.
export function flashErrors(req, messages) {
  req.session.driveErrors = messages;
}

export function readFlashErrors(req) {
  const errors = req.session.driveErrors ?? [];
  if (errors.length) req.session.driveErrors = [];
  return errors.map((msg) => ({ msg }));
}

// Same one-hop mechanism for non-error messages, e.g. a freshly minted share link.
export function flashNotices(req, messages) {
  req.session.driveNotices = messages;
}

export function readFlashNotices(req) {
  const notices = req.session.driveNotices ?? [];
  if (notices.length) req.session.driveNotices = [];
  return notices;
}
