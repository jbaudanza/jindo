'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.channel = channel;
exports.notify = notify;

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _pg = require('pg');

var _pg2 = _interopRequireDefault(_pg);

var _pg_config = require('./pg_config');

var _pg_config2 = _interopRequireDefault(_pg_config);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var client = new _pg2.default.Client(_pg_config2.default);
var connectedClient = _rxjs2.default.Observable.bindNodeCallback(client.connect.bind(client))();

function channel(key) {
  return connectedClient.flatMap(function (client) {
    return _rxjs2.default.Observable.create(function (observer) {

      if (!('subscriptionRefCounts' in client)) {
        client.subscriptionRefCounts = {};
      }

      if (!(key in client.subscriptionRefCounts)) {
        client.subscriptionRefCounts[key] = 0;
      }

      if (client.subscriptionRefCounts[key] === 0) {
        client.query('LISTEN ' + client.escapeIdentifier(key));
      }

      client.subscriptionRefCounts[key]++;

      function listener(event) {
        if (event.channel === key) {
          observer.next(event.payload);
        }
      }

      client.on('notification', listener);

      return function () {
        client.subscriptionRefCounts[key]--;

        if (client.subscriptionRefCounts[key] === 0) {
          client.query('UNLISTEN ' + client.escapeIdentifier(key));
        }
        client.removeListener('notification', listener);
      };
    });
  });
}

function notify(channel, message) {
  return connectedClient.forEach(function (client) {
    client.query('NOTIFY ' + client.escapeIdentifier(channel) + ", " + client.escapeLiteral(message));
  });
}