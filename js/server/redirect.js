"use strict";

// Middleware to be used in production to make sure that all requests use the
// www domain and https
function redirect(req, res, next) {
  let host = req.headers.host;
  let redirect = false;

  if (!host.match(/^www\..*/i) && !host.match(/herokuapp.com$/)) {
    host = 'www.' + host;
    redirect = true
  } else {
    redirect = req.headers['x-forwarded-proto'] != 'https';
  }

  if (redirect)
    res.redirect(301, "https://" + host + req.url);
  else
    next();
}

module.exports = redirect;
