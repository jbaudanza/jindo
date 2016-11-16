import Rx from 'rxjs';

export const logSubject = new Rx.Subject();
export const log = logSubject.asObservable();

const HEARTBEAT_INTERVAL = 15 * 60 * 1000;

/*
  insertEvent - This should be a function that takes event and returns
     a promise that resolves when the event is persisted. The process won't
     exit until the shutdown event is persisted or a timeout elapses.
*/
export function startup(insertEvent) {
  insertEvent({type: 'startup'});

  const intervalId = setInterval(
    () => insertEvent({type: 'heartbeat'})
  , HEARTBEAT_INTERVAL);

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  function cleanup() {
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

    insertEvent({type: 'shutdown'}).then(exit, exitWithError);
  }
}
