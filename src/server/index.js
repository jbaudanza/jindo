import express from 'express';
import * as database from './database';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import Rx from 'rxjs';
import * as _ from 'lodash';
import * as processLifecycle from './process_lifecycle';
import ObservablesServer from './observables_server'

const csrfProtection = csurf({
  cookie: true
});


// function insertServerEvent(type) {
//   return database.insertEvent(
//       {type: type},
//       null /* actorId */,
//       'server-event',
//       processId,
//       null, /* connectionId */
//       null, /* sessionId */
//       null /* ip */);
// }

let appSecret;

function postEvent(req, res, next) {
  const body = req.body;

  const errors = [];

  function validate(obj, key, type) {
    if (!(key in obj)) {
      errors.push('Missing required attribute: ' + key)
      return false;
    }

    if (typeof obj[key] !== type) {
      errors.push(`Expected type of ${key} to be ${type}`)
      return false;
    }

    return true;
  }

  function reserved(obj, key) {
    if (key in obj) {
      errors.push('Reserved attribute: ' + key)
      return false;
    } else {
      return true;
    }
  }

  validate(body, 'event', 'object');
  validate(body, 'sessionId', 'string');
  validate(body, 'name', 'string');

  if (errors.length === 0) {
    reserved(body.event, 'timestamp');
    reserved(body.event, 'actor');
  }

  if (errors.length > 0) {
    res.status(400).json({errors: errors});
    return;
  }

  const sessionId = body.sessionId;
  const name = body.name;

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
  
  database.shouldThrottle(req.ip, '10 seconds', 5).then(function(retryAfter) {
    if (retryAfter) {
      res
        .set('Retry-After', retryAfter)
        .status(429)
        .json({error: 'Too many requests', retryAfter: retryAfter});
    } else {
      res.status(201).json(
        database.insertEvent(body.event, actor, name, null, sessionId, req.ip)
      );
    }
  }, next);
}


function logger(message) {
  console.log(new Date().toISOString(), message);
}

export function start(observables) {

  processLifecycle.log.subscribe(logger);
  processLifecycle.events.subscribe(function(e) { console.log('event', e);})

  processLifecycle.startup();

  const app = express();
  app.enable('trust proxy');

  app.use(require('express-promise')());
  app.use(require('body-parser').json());

  // To generate a good secret: openssl rand 32 -base64
  app.use(cookieParser(process.env['SECRET']));
  app.use(csrfProtection);

  app.use(require('./auth'));

  const crossSiteHeaders = require('./crossSiteHeaders')

  app.options('/events', crossSiteHeaders);

  app.post('/events', crossSiteHeaders, postEvent);

  const server = app.listen((process.env['PORT'] || 5000), function() {
    console.log("HTTP server listening to", server.address().port);
  });

  const observablesServer = new ObservablesServer(server, observables);
  observablesServer.log.subscribe(logger);

  return app;
}


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


const allEvents = database.observable('server-events');


function reduceEventStream(eventStream, fn) {
  return eventStream.scan((state, events) => events.reduce(fn, state), {});
}

let serversOnline = reduceEventStream(allEvents, reduceToServerList);

serversOnline = Rx.Observable.combineLatest(ticks, serversOnline, removeDeadProcesses)
  .distinctUntilChanged(_.isEqual)


function reduceToConnectionList(connections, event) {
  switch (event.type) {
    case 'connection-open':
      const obj = {};
      obj[event.sessionId] = {processId: event.processId};
      return _.assign({}, connections, obj);

    case 'connection-closed':
      return _.omit(connections, event.sessionId);
  }

  return connections;
}

const connections = reduceEventStream(allEvents, reduceToConnectionList);

// TODO: 
// - Restrict the open connections list to only processes that are alive.
// - Associate a join event for each session
// - expose these streams on the client somehow
// connections.subscribe(function(e) {
//   console.log(e)
// });
