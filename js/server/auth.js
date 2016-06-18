const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const qs = require('qs');
const Tokens = require('csrf');
const cookieParser = require('cookie-parser');
const express = require('express');


const app = new express.Router();


const providersJson = require('../providers');
const providers = {};

for (let k in providersJson) {
  providers[k] = Object.assign(
    {
      clientId: process.env[`${k.toUpperCase()}_CLIENT_ID`],
      redirectUri: `http://localhost:5000/oauth-callback/${k}`
    },
    providersJson[k]
  )
}


app.get('/providers.json', function(req, res) {
  res.json(Object.assign({csrf: req.csrfToken()}, providers));
});


const tokens = new Tokens();

app.get('/oauth-callback/:provider', function(req, res) {
  if (!req.query['code']) {
    res.status('400').send('Missing oauth code');
    return;
  };

  if (!tokens.verify(req.cookies._csrf, req.query['state'])) {
    res.status('403').send('CSRF failure');
    return;    
  }

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
  // This should set a cookie or something
  // TODO: we should probably store this in some stream somewhere
  const accessTokenResponse = fetch(provider.tokenUrl, {
    method: 'POST',
    body: qs.stringify(body),
    headers: {'Content-Type': 'application/x-www-form-urlencoded'}
  }).then(res => res.json());

  const profileResponse = accessTokenResponse.then(function(response) {
    return fetch(provider.profileUrl, {
      headers: {'Authorization': 'OAuth ' + response['access_token']}
    }).then(r => r.json())
  });

  profileResponse.then(function(profile) {
    res.cookie('user_id', "soundcloud:" + profile['id'], {signed: true});
    console.log(jwt.sign({provider: 'soundcloud', userId: profile['id']}, process.env['SECRET']));
    res.send(profile);
  })
});

module.exports = app;

