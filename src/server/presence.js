import * as _ from 'lodash';
import Rx from 'rxjs';

// TODO: This are duplicated in RxEventStore module. Consolidate this
// somehow
function batchedScan(project, seed) {
  return Rx.Observable.create((observer) => {
    let baseIndex = 0;

    return this.scan(function(acc, batch) {
      const result = batch.reduce(function(innerAcc, currentValue, index) {
        return project(innerAcc, currentValue, baseIndex + index);
      }, acc);

      baseIndex += batch.length;

      return result;
    }, seed).subscribe(observer);
  });
};

// TODO: 
//  - handle the case where one session spans multiple processes


function removeDeadProcesses(now, processes) {
  return _.omitBy(processes, (p) => (now - p.lastSeen) > HEARTBEAT_INTERVAL )
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

    case 'heartbeat':
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

const HEARTBEAT_INTERVAL = 15 * 60 * 1000;

const ticks =
    Rx.Observable.merge(
        Rx.Observable.of(0),
        Rx.Observable.interval(HEARTBEAT_INTERVAL)
    ).map((x) => new Date())


function logger(key) {
  return {
    next(x) { console.log('NEXT: ' + key, x); },
    error(err) { console.log('ERROR:' + key, err); },
    complete() { console.log('COMPLETED:' + key); }
  };
}

// Returns an observable of session ids that are currently online.
export function sessions(connectionEvents, processEvents) {
  const processesOnline = Rx.Observable.combineLatest(
    ticks,
    batchedScan.call(processEvents, reduceToServerList, {}),
    removeDeadProcesses
  ).map(Object.keys).distinctUntilChanged(_.isEqual);

  const allSessions = batchScan.call(connectionEvents, reduceToSessionList, {});

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
