import Rx from 'rxjs';
import pg from 'pg';

import Pool from 'pg-pool';
import {debounce} from 'lodash';

import config from './pg_config';

// TODO: All these modules should share a connection pool
const pool = new Pool(config);


const client = new pg.Client(config);
const connectedClient = new Promise(function(resolve, reject) {
  client.connect((err) => err ? reject(err) : resolve(client));
});

const store = {};

function fetch(key) {
  return pool.connect().then(function(client) {
    function done() { client.release(); }

    const promise = client.query("SELECT value FROM key_values WHERE key=$1", [key])
      .then(results => (results.rowCount > 0) ? results.rows[0].value : undefined);

    promise.then(done, done);

    return promise;
  });
}

function update(key, oldValue, newValue) {
  return pool.connect().then(function(client) {
    function done() { client.release(); }

    return client
      .query("UPDATE key_values SET value=$1 WHERE key=$2", [newValue, key])
      .then(function(result) {
        // Update failed, do an insert instead
        if (result.rowCount === 0) {
          return client.query("INSERT into key_values (value, key) VALUES ($1, $2)", [newValue, key]);
        }
      })
      .then(done, done);
  });
}


// TODO: Consider having this skip() the source observable
// TODO: Consider that a better pattern might be a PersistedBehaviorSubject.
//       It's more clear that there is a "current value", and it is explicitly
//       clear who is doing the writing.
//       How does the BehaviorSubject keep track of which events have been processed?
//       Maybe it doesnt...
//       It's also possible that database.observable becomes PersistedReplaySubject
Rx.Observable.prototype.snapshotLatest = function(key, orderFn, shouldPersistFn) {
  const outer = this;

  return Rx.Observable.create(function(observer) {
    let innerSub;

    const debouncedUpdate = debounce(update, 100);

    fetch(key).then(function(initialValue) {
      if (typeof initialValue !== 'undefined') 
        observer.next(initialValue);

      let lastValue = initialValue;

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

    return function() {
      if (innerSub)
        innerSub.unsubscribe();
    }
  });
};
