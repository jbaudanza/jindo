'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.log = exports.logSubject = undefined;
exports.startup = startup;

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var logSubject = exports.logSubject = new _rxjs2.default.Subject();
var log = exports.log = logSubject.asObservable();

var HEARTBEAT_INTERVAL = 15 * 60 * 1000;

/*
  insertEvent - This should be a function that takes event and returns
     a promise that resolves when the event is persisted. The process won't
     exit until the shutdown event is persisted or a timeout elapses.
*/
function startup(insertEvent) {
  insertEvent({ type: 'startup' });

  var intervalId = setInterval(function () {
    return insertEvent({ type: 'heartbeat' });
  }, HEARTBEAT_INTERVAL);

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  function cleanup() {
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

    insertEvent({ type: 'shutdown' }).then(exit, exitWithError);
  }
}