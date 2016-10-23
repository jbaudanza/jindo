'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.reconnect = exports.observable = exports.connected = exports.reconnectingAt = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

exports.publish = publish;
exports.authenticate = authenticate;

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _qs = require('qs');

var _qs2 = _interopRequireDefault(_qs);

var _client = require('rxremote/client');

var _client2 = _interopRequireDefault(_client);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

require('whatwg-fetch');

function getJindoHost() {
  return [window.location.protocol, window.location.host];
}

function getJindoOrigin() {
  return window.location.origin;
}

var providersPromise = fetch(getJindoOrigin() + '/providers.json', { credentials: 'include' }).then(function (r) {
  return r.json();
});

var _getJindoHost = getJindoHost();

var _getJindoHost2 = _slicedToArray(_getJindoHost, 2);

var httpProtocol = _getJindoHost2[0];
var hostname = _getJindoHost2[1];

var protocol = httpProtocol === 'https:' ? 'wss:' : 'ws:';
var endpoint = protocol + '//' + hostname;
var observablesClient = new _client2.default(endpoint);

// TODO: it's probably better to just expose the ObservablesClient directly
var reconnectingAt = exports.reconnectingAt = observablesClient.reconnectingAt;
var connected = exports.connected = observablesClient.connected;
var observable = exports.observable = observablesClient.observable.bind(observablesClient);
var reconnect = exports.reconnect = observablesClient.reconnect;

var providers = null;
providersPromise.then(function (value) {
  providers = value;
});

function publish(key, value, token) {
  var body = {
    sessionId: observablesClient.sessionId,
    key: key,
    value: value
  };

  // TODO: Kind of weird to put the csrf token on the providers list
  return providersPromise.then(function (providers) {
    var headers = {
      'Content-Type': 'application/json',
      'csrf-token': providers.csrf
    };

    if (token) {
      headers['Authorization'] = "Bearer " + token;
    }

    return fetch(getJindoOrigin() + '/events', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(body),
      headers: headers
    }).then(function (r) {
      return r.json();
    });
  });
}

var authFunc = null;

function authenticate(providerName) {
  if (!providerName) providerName = 'github';

  if (!providers) return;

  if (!(providerName in providers)) {
    throw "Unknown authentication provider";
  }

  var provider = providers[providerName];

  var url = provider.authUrl + "?" + _qs2.default.stringify({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    response_type: 'code',
    state: providers.csrf + "|" + window.location.origin
  });

  var popup = window.open(url, 'login', 'width=620,height=600');

  return new Promise(function (resolve, reject) {
    authFunc = function authFunc(object) {
      popup.close();
      // TODO: check for errors here
      resolve(object);
    };
  });
}

var messageEvent = _rxjs2.default.Observable.fromEvent(window, 'message');

messageEvent.subscribe(function (event) {
  if (!authFunc) return;

  var obj = event.data;

  if ((typeof obj === 'undefined' ? 'undefined' : _typeof(obj)) !== 'object' || obj.type !== 'jindo-authentication') return;

  if (event.origin !== getJindoOrigin()) return;

  authFunc(obj.token);
  authFunc = null;
});