"use strict";

const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const qs = require('qs');
const Tokens = require('csrf');
const cookieParser = require('cookie-parser');
const express = require('express');


const app = new express.Router();


const providersJson = require('../providers');

function getProviders(req) {
  const hostname = req.get('host');
  const providers = {};

  for (let k in providersJson) {
    providers[k] = Object.assign(
      {
        clientId: process.env[`${k.toUpperCase()}_CLIENT_ID`],
        redirectUri: `${req.protocol}://${hostname}/oauth-callback/${k}`
      },
      providersJson[k]
    )
  }

  return providers;
}

const crossSiteHeaders = require('./crossSiteHeaders')

app.options('/providers.json', crossSiteHeaders);

app.get('/providers.json', crossSiteHeaders, function(req, res) {
  res.json(
    Object.assign(
      {csrf: req.csrfToken()},
      getProviders(req)
    )
  );
});


const tokens = new Tokens();

app.get('/oauth-callback/:provider', function(req, res, next) {
  if (!req.query['code']) {
    res.status('400').send('Missing oauth code');
    return;
  };

  const stateParts = req.query['state'].split("|");
  const csrfToken = stateParts[0];
  const origin = stateParts[1];

  if (!tokens.verify(req.cookies._csrf, csrfToken)) {
    res.status('403').send('CSRF failure');
    return;    
  }

  const providers = getProviders(req);

  const provider = providers[req.params.provider];
  const clientSecret = process.env[`${req.params.provider.toUpperCase()}_CLIENT_SECRET`];

  if (!provider) {
    res.status('404').send('Unknown auth provider');
    return;
  }

  const body = {
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
  }).then(res => res.json()).then(function(response) {

    //
    // Then fetch the profile
    //
    return fetch(provider.profileUrl, {
      headers: {'Authorization': 'OAuth2 ' + response['access_token']}
    }).then(r => r.json())
  }).then(function(profile) {
    if (!('id' in profile)) {
      throw "Unable to fetch profile information";
    }

    const identity = {
      provider: req.params.provider,
      userId: profile['id']
    };
    const token = jwt.sign(identity, process.env['SECRET']);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(responseHtml(token, origin));
  }, next);
});


function responseHtml(token, origin) {

  return (
`<!DOCTYPE html>
<html lang="en">
  <head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <title>Authenticate</title>
    <script type="text/javascript">
      function onLoad() {
        window.opener.postMessage({type: 'jindo-authentication', token: '${token}'}, '${origin}');
      }
    </script>
  </head>
  <body onload="onLoad()">
    <b style="width: 100%; text-align: center;">
      This popup should automatically close in a few seconds
    </b>
  </body>
</html>
`);
};


module.exports = app;

