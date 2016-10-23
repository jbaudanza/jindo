"use strict";

var jwt = require('jsonwebtoken');
var fetch = require('node-fetch');
var qs = require('qs');
var Tokens = require('csrf');
var cookieParser = require('cookie-parser');
var express = require('express');

var app = new express.Router();

var providersJson = require('../../providers');

function getProviders(req) {
  var hostname = req.get('host');
  var providers = {};

  for (var k in providersJson) {
    providers[k] = Object.assign({
      clientId: process.env[k.toUpperCase() + '_CLIENT_ID'],
      redirectUri: req.protocol + '://' + hostname + '/oauth-callback/' + k
    }, providersJson[k]);
  }

  return providers;
}

var crossSiteHeaders = require('./crossSiteHeaders');

app.options('/providers.json', crossSiteHeaders);

app.get('/providers.json', crossSiteHeaders, function (req, res) {
  res.json(Object.assign({ csrf: req.csrfToken() }, getProviders(req)));
});

var tokens = new Tokens();

app.get('/oauth-callback/:provider', function (req, res, next) {
  if (!req.query['code']) {
    res.status('400').send('Missing oauth code');
    return;
  };

  var stateParts = req.query['state'].split("|");
  var csrfToken = stateParts[0];
  var origin = stateParts[1];

  if (!tokens.verify(req.cookies._csrf, csrfToken)) {
    res.status('403').send('CSRF failure');
    return;
  }

  var providers = getProviders(req);

  var provider = providers[req.params.provider];
  var clientSecret = process.env[req.params.provider.toUpperCase() + '_CLIENT_SECRET'];

  if (!provider) {
    res.status('404').send('Unknown auth provider');
    return;
  }

  var body = {
    grant_type: 'authorization_code',
    client_secret: clientSecret,
    client_id: provider.clientId,
    code: req.query['code'],
    redirect_uri: provider.redirectUri
  };

  // TODO: check for auth errors.

  //
  // Fetch access token
  //
  fetch(provider.tokenUrl, {
    method: 'POST',
    body: qs.stringify(body),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    }
  }).then(function (res) {
    return res.json();
  }).then(function (response) {

    //
    // Then fetch the profile
    //
    return fetch(provider.profileUrl, {
      headers: { 'Authorization': 'OAuth2 ' + response['access_token'] }
    }).then(function (r) {
      return r.json();
    });
  }).then(function (profile) {
    if (!('id' in profile)) {
      throw "Unable to fetch profile information";
    }

    var identity = {
      provider: req.params.provider,
      userId: profile['id']
    };
    var token = jwt.sign(identity, process.env['SECRET']);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(responseHtml(token, origin));
  }, next);
});

function responseHtml(token, origin) {

  return '<!DOCTYPE html>\n<html lang="en">\n  <head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n    <title>Authenticate</title>\n    <script type="text/javascript">\n      function onLoad() {\n        window.opener.postMessage({type: \'jindo-authentication\', token: \'' + token + '\'}, \'' + origin + '\');\n      }\n    </script>\n  </head>\n  <body onload="onLoad()">\n    <b style="width: 100%; text-align: center;">\n      This popup should automatically close in a few seconds\n    </b>\n  </body>\n</html>\n';
};

module.exports = app;