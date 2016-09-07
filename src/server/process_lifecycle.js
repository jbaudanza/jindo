import uuid from 'node-uuid';
import Rx from 'rxjs';
import * as _ from 'lodash';

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


function removeDeadProcesses(now, processes) {
  return _.omitBy(processes, (p) => (now - p.lastSeen) > PING_INTERVAL )
}


function reduceBatchToServerList(processes, events) {
  return events.reduce(reduceToServerList, processes);
  return reduceToServerList(processes, event);
}

function reduceToServerList(processes, event) {
  if (!event.processId)
    return processes;

  function build(value) {
    const obj = {};
    if (obj.processId) {
      obj[event.processId] = Object.assign({}, obj.processId, value);
    } else {
      obj[event.processId] = value;
    }

    return Object.assign({}, processes, obj);
  }

  switch (event.type) {
    case 'startup':
      return build({startedAt: event.timestamp, lastSeen: event.timestamp});

    case 'ping':
      return build({lastSeen: event.timestamp});

    case 'shutdown':
      return _.omit(processes, event.processId);

    default:
      return processes;
  }
}

const ticks =
  Rx.Observable.merge(
      Rx.Observable.of(0),
      Rx.Observable.interval(PING_INTERVAL)
  ).map((x) => new Date())


function reduceEventStream(eventStream, fn) {
  return eventStream.scan((state, events) => events.reduce(fn, state), {});
}

export const processesOnline = Rx.Observable.combineLatest(
  ticks,
  reduceEventStream(database.observable('process-lifecycle'), reduceToServerList),
  removeDeadProcesses
).distinctUntilChanged(_.isEqual);



function reduceToSessionList(sessions, event) {
  switch (event.type) {
    case 'connection-open':
      const obj = {};
      obj[event.sessionId] = {processId: event.processId};
      return _.assign({}, sessions, obj);

    case 'connection-closed':
      return _.omit(sessions, event.sessionId);
  }

  return sessions;
}

function removeOfflineSessions(allSessions, processIds) {
  return Object.keys(_.pickBy(
      allSessions, (props, sessionId) => _.includes(processIds, props.processId)
  ));
}

// Results in a hash that looks like:
/*
  {
    [sessionId]: {
      processId: [processId]
    },
    ...
  }
*/
const allSessions = reduceEventStream(
    database.observable('connection-events'), reduceToSessionList);

const sessionsSubject = new Rx.BehaviorSubject([]);
export const sessions = sessionsSubject.asObservable();

const combined = Rx.Observable.combineLatest(
  [
    allSessions,
    processesOnline.map(Object.keys)
  ],
  removeOfflineSessions
);

combined.subscribe(sessionsSubject);

// function logger(key) {
//   return {
//     next(x) { console.log(key, x); },
//     error(err) { console.log('ERROR:' + key, err); },
//     complete() { console.log('COMPLETED:' + key); }
//   };
// }
