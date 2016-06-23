"use strict";

if (process.env !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const database = require('./database');
const WebSocketServer = require('ws').Server;
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');

const csrfProtection = csurf({
  cookie: true
});

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


app.use(require('express-promise')());
app.use(require('body-parser').json());

// To generate a good secret: openssl rand 32 -base64
app.use(cookieParser(process.env['SECRET']));
app.use(csrfProtection);

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

const browserifyOptions = {
  transform: [['babelify', {presets: ["react", 'es2015']}]]
};

if (app.settings.env === 'development') {
  const browserify = require('browserify-middleware');
  app.get('/client.js', browserify('./js/client/index.js', browserifyOptions));
  app.get('/chat.js', browserify('./js/chat/index.js', browserifyOptions));
  app.get('/landing.js', browserify('./js/client/landing.js', browserifyOptions));
}

app.use(require('./auth'));



app.post('/events', function(req, res, next) {
  if (!req.headers['origin']) {
    res.status(400).json({error: 'Origin header required'});
    return;
  }

  const event = req.body;

  if ('timestamp' in event) {
    res.status(400).json({error: 'Reserverd attribute: timestamp'});
    return;
  }

  if ('actor' in event) {
    res.status(400).json({error: 'Reserverd attribute: actor'});
    return;
  }

  const authorization = req.headers['authorization'];
  let actor;
  if (authorization) {
    const parts = authorization.split(' ');
    const authScheme = parts[0];
    const token = parts[1];
    if (authScheme.toUpperCase() != 'BEARER') {
      res.status(403).json({error: 'Unsupported authorization scheme'});
      return;
    }

    try {
      actor = jwt.verify(token, process.env['SECRET']);
    } catch(e) {
      res.status(403).json({error: 'Invalid token'});
      return;
    }
  }

  // TODO:
  //  - do some validation on the body
  
  database.shouldThrottle(req.ip, '10 seconds', 5).then(function(retryAfter) {
    if (retryAfter) {
      res
        .set('Retry-After', retryAfter)
        .status(429)
        .json({error: 'Too many requests', retryAfter: retryAfter});
    } else {
      const promise = database.insertEvent(
        event, actor, req.ip, req.headers['origin']
      );

      promise.then(function() {
        database.query('NOTIFY events');
      });

      res.status(201).json(promise); 
    }
  }, next);
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
