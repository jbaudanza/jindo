"use strict";

if (process.env !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const database = require('./database');
const WebSocketServer = require('ws').Server;
const fetch = require('node-fetch');
const qs = require('qs');
const csurf = require('csurf');
const cookieParser = require('cookie-parser');

const app = express();

let logFormat;
let appSecret;

if (process.env['NODE_ENV'] === 'production') {
  logFormat = 'short'
} else {
  logFormat = 'dev';
}

app.enable('trust proxy');

app.use(require('morgan')(logFormat));
app.use(express.static('public'));

// To generate a good secret: openssl rand 64 -hex
app.use(cookieParser(process.env['SECRET']));

app.use(require('express-promise')());
app.use(require('body-parser').json());

//
// Ensure TLS is used in production
//
if (app.settings.env === 'production') {
  app.use(function(req, res, next) {
    if (req.headers['x-forwarded-proto'] == 'https')
      next();
    else
      res.redirect("https://" + req.headers.host + req.url);
  });
}

if (app.settings.env === 'development') {
  const browserify = require('browserify-middleware');
  app.get('/client.js', browserify('./js/client/index.js'));
}

const INSERT_SQL = `
  INSERT INTO events (actor_id, timestamp, ip_address, data, origin)
  VALUES (1, NOW(), $1, $2, $3)
`;

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
  res.json(providers);
});


// TODO: rename this to oauth callback
const csrfProtection = csurf({cookie: true});
app.get('/oauth-callback/:provider', csrfProtection, function(req, res) {
  console.log('csrf', req.csrfToken());

  if (!req.query['code']) {
    res.status('400').send('Missing oauth code');
    return;
  };

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
  fetch(provider.tokenUrl, {
    method: 'POST',
    body: qs.stringify(body),
    headers: {'Content-Type': 'application/x-www-form-urlencoded'}
  }).then(res => res.json()).then(json => { console.log(json); res.send('OK')});
});

app.post('/events', function(req, res) {
  if (!req.headers['origin']) {
    res.status(400).json({error: 'Origin header required'});
    return;
  }

  // TODO:
  //  - do some validation on the body
  //  - do some kind of request throttling
  const promise = database.query(INSERT_SQL, [req.ip, req.body, req.headers['origin']]);

  promise.then(function() {
    database.query('NOTIFY events');
  });

  res.json(promise);
});

const server = app.listen((process.env['PORT'] || 5000), function() {
  console.log("HTTP server listening to", server.address().port);
});

function requireOrigin(info) {
  if (!info.origin)
    return 400;
  else
    return true;
}

// TODO: Assert the protocol is wss
const wss = new WebSocketServer({server, verifyClient: requireOrigin});

wss.on('connection', function(socket) {
  const remoteAddr = (
      socket.upgradeReq.headers['x-forwarded-for'] || 
      socket.upgradeReq.connection.remoteAddress
  );

  const origin = socket.upgradeReq.headers['origin'];

  console.log("WebSocket connection opened", remoteAddr);

  let subscription = null;

  socket.on('message', function(message) {
    const minId = parseInt(message);
    subscription = database.streamEvents(minId, origin).subscribe(function(list) {
      if (socket.readyState === 1) { // OPEN
        socket.send(JSON.stringify(list));
      } else {
        console.warn("Tried to send to WebSocket in readyState", socket.readyState)
      }
    });
  });

  socket.on('close', function() {
    console.log("Closing WebSocket");
    if (subscription) {
      subscription.unsubscribe();
    }
  });
});
