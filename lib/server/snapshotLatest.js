'use strict';

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _pg = require('pg');

var _pg2 = _interopRequireDefault(_pg);

var _pgPool = require('pg-pool');

var _pgPool2 = _interopRequireDefault(_pgPool);

var _lodash = require('lodash');

var _pg_config = require('./pg_config');

var _pg_config2 = _interopRequireDefault(_pg_config);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// TODO: All these modules should share a connection pool
var pool = new _pgPool2.default(_pg_config2.default);

var client = new _pg2.default.Client(_pg_config2.default);
var connectedClient = new Promise(function (resolve, reject) {
  client.connect(function (err) {
    return err ? reject(err) : resolve(client);
  });
});

var store = {};

function fetch(key) {
  return pool.connect().then(function (client) {
    function done() {
      client.release();
    }

    var promise = client.query("SELECT value FROM key_values WHERE key=$1", [key]).then(function (results) {
      return results.rowCount > 0 ? results.rows[0].value : undefined;
    });

    promise.then(done, done);

    return promise;
  });
}

function update(key, oldValue, newValue) {
  return pool.connect().then(function (client) {
    function done() {
      client.release();
    }

    return client.query("UPDATE key_values SET value=$1 WHERE key=$2", [newValue, key]).then(function (result) {
      // Update failed, do an insert instead
      if (result.rowCount === 0) {
        return client.query("INSERT into key_values (value, key) VALUES ($1, $2)", [newValue, key]);
      }
    }).then(done, done);
  });
}

/**
DELETE ME:

 - When instantied, it starts where the last instantiation left off.

  // Names:
    - Property
    - ComputedStream
    - BehaviorSubject <- too different from RxJs BehaviorSubjects

  - Build it into jindo observable definition.
    PRO: easy
    CON: not composable with other jindo implementations (redis, memcache)
  
   jindo.observable('foobar', function(acc, i) { accumulator })

  - Create a new type

    updates = jindo.observable('foobar') <- Allow any observable or only jindos?
    new jindo.ComputedStream('foobar-count', updates, function(acc, i) { })

    options: {
      persistWhen: (i) => true
    }

    persisted: {
      key: 'foo-counter'
      eventsProcessed: 100
      currentValue: 200
    }

    On boot:
      - Query the most recent persisted value
      - skip the appropriate number of events in the input observable
      - emit the currentValue

    On event:
      - Update the currentValue
      - Persist if whenWrite() returns true
      - emit the currentValue
*/

// TODO: Consider having this skip() the source observable
// TODO: Consider that a better pattern might be a PersistedBehaviorSubject.
//       It's more clear that there is a "current value", and it is explicitly
//       clear who is doing the writing.
//       How does the BehaviorSubject keep track of which events have been processed?
//       Maybe it doesnt...
//       It's also possible that database.observable becomes PersistedReplaySubject
_rxjs2.default.Observable.prototype.snapshotLatest = function (key, orderFn, shouldPersistFn) {
  var outer = this;

  return _rxjs2.default.Observable.create(function (observer) {
    var innerSub = void 0;

    var debouncedUpdate = (0, _lodash.debounce)(update, 100);

    fetch(key).then(function (initialValue) {
      if (typeof initialValue !== 'undefined') observer.next(initialValue);

      var lastValue = initialValue;

      function next(nextValue) {
        if (typeof lastValue === 'undefined' || orderFn(lastValue, nextValue)) {
          if (shouldPersistFn(nextValue)) {
            debouncedUpdate(key, lastValue, nextValue);
          }

          observer.next(nextValue);
          lastValue = nextValue;
        }
      }

      innerSub = outer.subscribe(next, observer.error, observer.complete);
    }, observer.error);

    return function () {
      if (innerSub) innerSub.unsubscribe();
    };
  });
};