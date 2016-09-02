import uuid from 'node-uuid';
import Rx from 'rxjs';

export const eventsSubject = new Rx.Subject();
export const logSubject = new Rx.Subject();

export const events = eventsSubject.asObservable();
export const log = logSubject.asObservable();

export function startup() {
  insertServerEvent('server-startup');

  const PING_INTERVAL = 15 * 60 * 1000;
  const intervalId = setInterval(insertServerPing, PING_INTERVAL);

  process.on('SIGINT', cleanup.bind(null, intervalId));
  process.on('SIGTERM', cleanup.bind(null, intervalId));
}

function insertServerPing() {
  return insertServerEvent('server-ping');
}

function insertServerEvent(type) {
  eventsSubject.next({
    type: type,
  })
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
      log.next("Cleanup timed out");
      process.exit(2);
    },
    15000
  )

  insertServerEvent('server-shutdown').then(exit, exitWithError);
}

