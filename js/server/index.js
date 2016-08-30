"use strict";

if (process.env !== 'production') {
  require('dotenv').config();
}

require("babel-register")({
  presets: "es2015-node4", plugins: 'transform-flow-strip-types'
})

const express = require('express');
const database = require('./database');
const WebSocketServer = require('ws').Server;
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const uuid = require('node-uuid');
const Rx = require('rxjs');
const set = require('../set');
const _ = require('lodash');

const csrfProtection = csurf({
  cookie: true
});

const app = express();

const processId = uuid.v4();
console.log("Process ID", processId);

function insertServerEvent(type) {
  return database.insertEvent(
      {type: type},
      null /* actorId */,
      processId,
      null, /* connectionId */
      null, /* sessionId */
      null, /* ip */
      null /* origin */);
}

function insertServerPing() {
  return insertServerEvent('server-ping');
}

insertServerEvent('server-startup');

const PING_INTERVAL = 15 * 60 * 1000;
const intervalId = setInterval(insertServerPing, PING_INTERVAL);


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

const browserifyOptions = {
  transform: [['babelify', {presets: ["react", 'es2015']}]]
};

if (app.settings.env === 'development') {
  const browserify = require('browserify-middleware');
  app.get('/jindo.js', browserify('./js/client/index.js', browserifyOptions));
  app.get('/chat.js', browserify('./js/chat/index.js', browserifyOptions));
  app.get('/landing.js', browserify('./js/client/landing.js', browserifyOptions));
}

app.use(require('./auth'));

const crossSiteHeaders = require('./crossSiteHeaders')

app.options('/events', crossSiteHeaders);

app.post('/events', crossSiteHeaders, function(req, res, next) {
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

  const sessionId = event.sessionId;
  delete event.sessionId;

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
      res.status(201).json(
        database.insertEvent(event, actor, processId, null, sessionId, req.ip, req.headers['origin'])
      );
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

let connectionCounter = 0;

wss.on('connection', function(socket) {
  const remoteAddr = (
      socket.upgradeReq.headers['x-forwarded-for'] || 
      socket.upgradeReq.connection.remoteAddress
  );

  const origin = socket.upgradeReq.headers['origin'];

  function log(message) {
    console.log(`${new Date().toISOString()} [${remoteAddr}]`, message)
  }

  function send(object) {
    if (socket.readyState === 1) { // OPEN
      socket.send(JSON.stringify(object));
    } else {
      log(`Tried to send to WebSocket in readyState: ${socket.readyState}`)
    }
  }

  connectionCounter++;
  const connectionId = connectionCounter;

  function insertEvent(event, actor) {
    return database.insertEvent(event, actor, processId, connectionId, null, remoteAddr, origin);
  }

  log("WebSocket connection opened");

  let subscription = null;
  let presence = null;

  // This gets called when the socket is closed or the process shuts down.
  socket.cleanup = function() {
    log("Closing WebSocket");

    if (subscription) {
      subscription.unsubscribe();
    }

    if (presence && presence.partEvent) {
      return insertEvent(presence.partEvent, presence.token);
    } else {
      return Promise.resolve();
    }
  };

  socket.on('message', function(data) {
    let message;

    try {
      message = JSON.parse(data);
    } catch(e) {
      log("Error parsing JSON");
      console.error(e);
    }

    if (typeof message.type !== 'string') {
      log("Received message without a type")
      return;
    }

    log("received message " + message.type);

    switch (message.type) {
      case 'subscribe':
        if (subscription) {
          log("already subscribed");
          break;
        }

        if (typeof message.minId !== 'number') {
          log("expected minId number");
          break;
        }

        subscription = database.streamEvents(message.minId, origin)
            .map((list) => ({type: 'events', 'list': list}))
            .subscribe(send)

        break;
      case 'event':
        break;
      case 'presence':
        if (presence && presence.partEvent) {
          insertEvent(presence.partEvent, presence.token);
        }

        presence = message;

        if (presence.joinEvent) {
          insertEvent(presence.joinEvent, presence.token);
        }
        break;
      default:
        log(`Received unknown message type ${message.type}`)
        return;
    }
  });

  socket.on('close', socket.cleanup);
});

function cleanup() {
  console.log("Cleaning up")

  clearInterval(intervalId);

  // We have to manually call the cleanup functions on each client because we
  // want to wait for them to finish writing to the db before letting the
  // process exit.
  const promise = Promise.all(wss.clients.map(terminateClient));

  function terminateClient(client) {
    // Disable the close event so it's not called again when the connection
    // terminates
    client.removeListener('close', client.cleanup);

    const promise = client.cleanup();
    client.terminate();
    return promise;
  }

  function exit() {
    console.log('exiting')
    process.exit(0);
  }

  function exitWithError(error) {
    console.error(error);
    process.exit(1);
  }

  setTimeout(
    function() {
      console.error("Cleanup timed out");
      process.exit(2);
    },
    15000
  )

  promise
    .then(function() { wss.close(); })
    .then(insertServerEvent.bind(null, 'server-shutdown'))
    .then(exit, exitWithError);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);


/*
 * Next steps:
 *  - map that stream onto a stream of users that are online
 *  - make that visible to clients somehow
 */


function removeDeadProcesses(now, processes) {
  return _.omitBy(processes, (p) => (now - p.lastSeen) > PING_INTERVAL )
}


function reduceBatchToServerList(processes, events) {
  return events.reduce(reduceToServerList, processes);
  return reduceToServerList(processes, event);
}

function reduceToServerList(processes, event) {
  if (!event.processId)
    return processes;

  function build(value) {
    const obj = {};
    if (obj.processId) {
      obj[event.processId] = Object.assign({}, obj.processId, value);
    } else {
      obj[event.processId] = value;
    }

    return Object.assign({}, processes, obj);
  }

  switch (event.type) {
    case 'server-startup':
      return build({startedAt: event.timestamp, lastSeen: event.timestamp});

    case 'server-ping':
      return build({lastSeen: event.timestamp});

    case 'server-shutdown':
      return _.omit(processes, event.processId);

    default:
      return processes;
  }
}

const ticks = Rx.Observable.interval(1000)
    .map((x) => new Date())


let serversOnline = database.streamEvents(0, null)
  .scan((processes, events) => events.reduce(reduceToServerList, processes), {})

serversOnline = Rx.Observable.combineLatest(ticks, serversOnline, removeDeadProcesses)
  .distinctUntilChanged(_.isEqual)
