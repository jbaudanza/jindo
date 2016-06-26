function crossSiteHeaders(req, res, next) {
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,csrf-token');
  res.setHeader('Access-Control-Allow-Credentials', true);

  if (req.method == 'OPTIONS')
    res.send(200);
  else
    next();
};

module.exports = crossSiteHeaders;
