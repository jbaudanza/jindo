"use strict";

const express = require('express');
const database = require('./database');
const WebSocketServer = require('ws').Server;

const app = express();

let logFormat;
if (process.env['NODE_ENV'] === 'production') {
  logFormat = 'short'
} else {
  logFormat = 'dev';
}

app.enable('trust proxy');

app.use(express.static('public'));
app.use(require('express-promise')());
app.use(require('morgan')(logFormat));
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
  app.get('/client.js', browserify('./client/index.js'));
}

const INSERT_SQL = `
  INSERT INTO events (actor_id, timestamp, ip_address, data, origin)
  VALUES (1, NOW(), $1, $2, $3)
`;

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

const server = app.listen((process.env['PORT'] || 9292), function() {
  console.log("HTTP server listening to", server.address().port);
});

function requireOrigin(info) {
  if (!info.origin)
    return 400;
  else
    return true;
}

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
