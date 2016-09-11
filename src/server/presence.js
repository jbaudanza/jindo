import * as _ from 'lodash';
import Rx from 'rxjs';


// TODO: 
//  - handle the case where one session spans multiple processes


function removeDeadProcesses(now, processes) {
  return _.omitBy(processes, (p) => (now - p.lastSeen) > PING_INTERVAL )
}


function reduceBatchToServerList(processes, events) {
  return events.reduce(reduceToServerList, processes);
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


// Reduces to a Object that looks like:
/*
  {
    [sessionId]: {
      processId: [processId]
    },
    ...
  }
*/
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

function reduceEventStream(eventStream, fn) {
  return eventStream.scan((state, events) => events.reduce(fn, state), {});
}

const PING_INTERVAL = 15 * 60 * 1000;

const ticks =
    Rx.Observable.merge(
        Rx.Observable.of(0),
        Rx.Observable.interval(PING_INTERVAL)
    ).map((x) => new Date())


function logger(key) {
  return {
    next(x) { console.log('NEXT: ' + key, x); },
    error(err) { console.log('ERROR:' + key, err); },
    complete() { console.log('COMPLETED:' + key); }
  };
}

// Returns an observable of session ids that are currently online.
export function sessions(connnectionEvents, processEvents) {
  const processesOnline = Rx.Observable.combineLatest(
    ticks,
    reduceEventStream(processEvents, reduceToServerList),
    removeDeadProcesses
  ).map(Object.keys).distinctUntilChanged(_.isEqual);

  const allSessions = reduceEventStream(connnectionEvents, reduceToSessionList);

  const sessionsSubject = new Rx.BehaviorSubject([]);

  Rx.Observable.combineLatest(
    [
      allSessions,
      processesOnline
    ],
    removeOfflineSessions
  ).subscribe(sessionsSubject);

  return sessionsSubject.asObservable();
}