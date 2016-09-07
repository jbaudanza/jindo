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
      const meta = {
        actor: actor,
        sessionId: sessionId,
        ipAddress: req.ip
      }
      res.status(201).json(
        database.insertEvent(name, body.event, meta)
      );
    }
  }, next);
}


function logger(message) {
  console.log(new Date().toISOString(), message);
}

export function start(observables) {

  processLifecycle.log.subscribe(logger);
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

  // TODO: Is there someway to move this into process_lifecycle
  observablesServer.events.subscribe(function([event, meta]) {
    database.insertEvent('connection-events', event, meta);
  });

  return app;
}

// TODO: 
// - Associate a join event for each session
