'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.start = start;

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _database = require('./database');

var database = _interopRequireWildcard(_database);

var _jsonwebtoken = require('jsonwebtoken');

var _jsonwebtoken2 = _interopRequireDefault(_jsonwebtoken);

var _cookieParser = require('cookie-parser');

var _cookieParser2 = _interopRequireDefault(_cookieParser);

var _csurf = require('csurf');

var _csurf2 = _interopRequireDefault(_csurf);

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _lodash = require('lodash');

var _ = _interopRequireWildcard(_lodash);

var _process_lifecycle = require('./process_lifecycle');

var processLifecycle = _interopRequireWildcard(_process_lifecycle);

var _server = require('rxremote/server');

var _server2 = _interopRequireDefault(_server);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var csrfProtection = (0, _csurf2.default)({
  cookie: true
});

var appSecret = void 0;

function postEvent(handlers, req, res, next) {
  var body = req.body;

  var errors = [];

  function validate(obj, key, type) {
    if (!(key in obj)) {
      errors.push('Missing required attribute: ' + key);
      return false;
    }

    if (_typeof(obj[key]) !== type) {
      errors.push('Expected type of ' + key + ' to be ' + type);
      return false;
    }

    return true;
  }

  function reserved(obj, key) {
    if (key in obj) {
      errors.push('Reserved attribute: ' + key);
      return false;
    } else {
      return true;
    }
  }

  validate(body, 'value', 'object');
  validate(body, 'sessionId', 'string');
  validate(body, 'key', 'string');

  if (errors.length === 0) {
    reserved(body.value, 'timestamp');
    reserved(body.value, 'actor');
  }

  if (errors.length > 0) {
    res.status(400).json({ errors: errors });
    return;
  }

  var sessionId = body.sessionId;
  var name = body.name;

  var authorization = req.headers['authorization'];
  var actor = void 0;
  if (authorization) {
    var parts = authorization.split(' ');
    var authScheme = parts[0];
    var token = parts[1];
    if (authScheme.toUpperCase() != 'BEARER') {
      res.status(403).json({ error: 'Unsupported authorization scheme' });
      return;
    }

    try {
      actor = _jsonwebtoken2.default.verify(token, process.env['SECRET']);
    } catch (e) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }
  }

  var limit = void 0;
  if (process.env['NODE_ENV'] === 'production') {
    limit = 5;
  } else {
    limit = 1000;
  }

  function respondWithError(code, text) {
    res.status(code).json({
      error: text,
      code: code
    });
  }

  if (handlers[body.key]) {
    var meta = {
      actor: actor,
      sessionId: sessionId,
      ipAddress: req.ip
    };

    handlers[body.key](body.value, meta).then(function (response) {
      res.status(201).json(response);
    }, function (error) {
      if (error.retryAfter) {
        res.set('Retry-After', error.retryAfter).status(429).json({ error: 'Too many requests', retryAfter: error.retryAfter });
      } else {
        console.error("Error raised during handler: " + body.key);
        console.error(error);
        respondWithError(500, "Internal Server Error");
      }
    });
  } else {
    respondWithError(404, 'Not found');
  }
}

function logger(message) {
  console.log(new Date().toISOString(), message);
}

function start(observables, handlers) {

  processLifecycle.log.subscribe(logger);
  processLifecycle.startup();

  var app = (0, _express2.default)();
  app.enable('trust proxy');

  if (app.settings.env === 'production') {
    app.use(require('./redirect'));
  }

  app.use(require('express-promise')());
  app.use(require('body-parser').json());

  // To generate a good secret: openssl rand 32 -base64
  app.use((0, _cookieParser2.default)(process.env['SECRET']));
  app.use(csrfProtection);

  app.use(require('./auth'));

  var crossSiteHeaders = require('./crossSiteHeaders');

  app.options('/events', crossSiteHeaders);

  app.post('/events', crossSiteHeaders, postEvent.bind(null, handlers));

  var server = app.listen(process.env['PORT'] || 5000, function () {
    console.log("HTTP server listening to", server.address().port);
  });

  var observablesServer = new _server2.default(server, observables);
  observablesServer.log.subscribe(logger);

  // TODO: Is there someway to move this into process_lifecycle
  observablesServer.events.subscribe(function (_ref) {
    var _ref2 = _slicedToArray(_ref, 2);

    var event = _ref2[0];
    var meta = _ref2[1];

    database.insertEvent('connection-events', event, meta);
  });

  return app;
}

// TODO: 
// - Associate a join event for each session