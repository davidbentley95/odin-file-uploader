export function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/log-in');
}

export default isAuth;
