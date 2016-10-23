'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.log = exports.logSubject = exports.eventsSubject = undefined;
exports.startup = startup;

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _database = require('./database');

var database = _interopRequireWildcard(_database);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var eventsSubject = exports.eventsSubject = new _rxjs2.default.Subject();
var logSubject = exports.logSubject = new _rxjs2.default.Subject();

var log = exports.log = logSubject.asObservable();
var HEARTBEAT_INTERVAL = 15 * 60 * 1000;

function startup() {
  insertServerEvent('startup');

  var intervalId = setInterval(insertServerHeartbeat, HEARTBEAT_INTERVAL);

  process.on('SIGINT', cleanup.bind(null, intervalId));
  process.on('SIGTERM', cleanup.bind(null, intervalId));
}

function insertServerHeartbeat() {
  return insertServerEvent('heartbeat');
}

function insertServerEvent(type) {
  return database.insertEvent('process-lifecycle', { type: type });
}

function cleanup(intervalId) {
  logSubject.next("Cleaning up");

  clearInterval(intervalId);

  function exit() {
    logSubject.next('exiting');
    process.exit(0);
  }

  function exitWithError(error) {
    console.error(error);
    process.exit(1);
  }

  setTimeout(function () {
    logSubject.next("Cleanup timed out");
    process.exit(2);
  }, 15000);

  insertServerEvent('shutdown').then(exit, exitWithError);
}

// function logger(key) {
//   return {
//     next(x) { console.log(key, x); },
//     error(err) { console.log('ERROR:' + key, err); },
//     complete() { console.log('COMPLETED:' + key); }
//   };
// }