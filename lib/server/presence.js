'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.sessions = sessions;

var _lodash = require('lodash');

var _ = _interopRequireWildcard(_lodash);

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

// TODO: This is duplicated in RxEventStore module. Consolidate this
// somehow
function batchedScan(project, seed) {
  var _this = this;

  return _rxjs2.default.Observable.create(function (observer) {
    var baseIndex = 0;

    return _this.scan(function (acc, batch) {
      var result = batch.reduce(function (innerAcc, currentValue, index) {
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
  return _.omitBy(processes, function (p) {
    return now - p.lastSeen > HEARTBEAT_INTERVAL;
  });
}

function reduceToServerList(processes, event) {
  if (!event.processId) return processes;

  function build(value) {
    var obj = {};
    if (obj.processId) {
      obj[event.processId] = Object.assign({}, obj.processId, value);
    } else {
      obj[event.processId] = value;
    }

    return Object.assign({}, processes, obj);
  }

  switch (event.value) {
    case 'startup':
      return build({ startedAt: event.timestamp, lastSeen: event.timestamp });

    case 'heartbeat':
      return build({ lastSeen: event.timestamp });

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
  switch (event.value) {
    case 'connection-open':
      var obj = {};
      obj[event.sessionId] = { processId: event.processId };
      return _.assign({}, sessions, obj);

    case 'connection-closed':
      return _.omit(sessions, event.sessionId);
  }

  return sessions;
}

function removeOfflineSessions(allSessions, processIds) {
  return Object.keys(_.pickBy(allSessions, function (props, sessionId) {
    return _.includes(processIds, props.processId);
  }));
}

var HEARTBEAT_INTERVAL = 15 * 60 * 1000;

var ticks = _rxjs2.default.Observable.merge(_rxjs2.default.Observable.of(0), _rxjs2.default.Observable.interval(HEARTBEAT_INTERVAL)).map(function (x) {
  return new Date();
});

function logger(key) {
  return {
    next: function next(x) {
      console.log('NEXT: ' + key, x);
    },
    error: function error(err) {
      console.log('ERROR:' + key, err);
    },
    complete: function complete() {
      console.log('COMPLETED:' + key);
    }
  };
}

// Returns an observable of session ids that are currently online.
function sessions(connectionEvents, processEvents) {
  var processesOnline = _rxjs2.default.Observable.combineLatest(ticks, batchedScan.call(processEvents, reduceToServerList, {}), removeDeadProcesses).map(Object.keys).distinctUntilChanged(_.isEqual);

  var allSessions = batchedScan.call(connectionEvents, reduceToSessionList, {});

  var sessionsSubject = new _rxjs2.default.BehaviorSubject([]);

  _rxjs2.default.Observable.combineLatest([allSessions, processesOnline], removeOfflineSessions).subscribe(sessionsSubject);

  return sessionsSubject.asObservable();
}