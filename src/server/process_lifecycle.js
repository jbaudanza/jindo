import uuid from 'node-uuid';
import Rx from 'rxjs';

export const processId = uuid.v4();
export const events = new Rx.Subject();
export const log = new Rx.Subject();

export function startup() {
  log.next(`Process ID ${processId}`);

  insertServerEvent('server-startup');

  const PING_INTERVAL = 15 * 60 * 1000;
  const intervalId = setInterval(insertServerPing, PING_INTERVAL);

  events.complete();
  log.complete();

  process.on('SIGINT', cleanup.bind(null, intervalId));
  process.on('SIGTERM', cleanup.bind(null, intervalId));
}

function insertServerPing() {
  return insertServerEvent('server-ping');
}

function insertServerEvent(type) {
  events.next({
    type: type,
    processId: processId
  })
}

function cleanup(intervalId) {
  log.next("Cleaning up")

  clearInterval(intervalId);

  function exit() {
    log.next('exiting')
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

