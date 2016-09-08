import Rx from 'rxjs';

import * as database from './database';


export const eventsSubject = new Rx.Subject();
export const logSubject = new Rx.Subject();

export const log = logSubject.asObservable();
const PING_INTERVAL = 15 * 60 * 1000;

export function startup() {
  insertServerEvent('startup');

  const intervalId = setInterval(insertServerPing, PING_INTERVAL);

  process.on('SIGINT', cleanup.bind(null, intervalId));
  process.on('SIGTERM', cleanup.bind(null, intervalId));
}

function insertServerPing() {
  return insertServerEvent('ping');
}

function insertServerEvent(type) {
  return database.insertEvent('process-lifecycle', {type: type})
}

function cleanup(intervalId) {
  logSubject.next("Cleaning up")

  clearInterval(intervalId);

  function exit() {
    logSubject.next('exiting');
    process.exit(0);
  }

  function exitWithError(error) {
    console.error(error);
    process.exit(1);
  }

  setTimeout(
    function() {
      logSubject.next("Cleanup timed out");
      process.exit(2);
    },
    15000
  )

  insertServerEvent('shutdown').then(exit, exitWithError);
}


// function logger(key) {
//   return {
//     next(x) { console.log(key, x); },
//     error(err) { console.log('ERROR:' + key, err); },
//     complete() { console.log('COMPLETED:' + key); }
//   };
// }
