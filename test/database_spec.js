import assert from 'assert';
import Rx from 'rxjs';
import uuid from 'node-uuid';
import {times} from 'lodash';

import * as database from '../src/server/database';


function insertEvents(key, count) {
  return database.insertEvents(key, times(count));
}

function reduceToList(list, i) {
  return list.concat([i]);
}

describe("database.observable", () => {
  it('should stream a set of results', () => {
    const key = uuid.v4();
    insertEvents(key, 3);

    const observable = database.observable(key);

    return observable
      .take(3)
      .reduce(reduceToList, [])
      .toPromise()
      .then(function(results) {
        assert.equal(results.length, 3);

        // Insert some more events and check to make sure they are also
        // streamed
        insertEvents(key, 3);

        return observable.take(6).reduce(reduceToList, []).toPromise();
      }).then(function(results) {
        assert.equal(results.length, 6);
      })
  });

  it('should return a set of results and then end', () => {
    const key = uuid.v4();
    const inserts = insertEvents(key, 3);

    return inserts.then(() => (
      database.observable(key, {stream: false})
        .reduce(reduceToList, [])
        .forEach((results) => {
          assert.equal(results.length, 3);
        })
    ));
  });

  it('should work with numbers, strings, arrays and objects', () => {
    const key = uuid.v4();

    const events = [
      123,
      {numbers: 123},
      [1,2,3],
      'Hello: 123'
    ];

    return database.insertEvents(key, events).then(() => (
      database.observable(key, {stream: false})
        .reduce(reduceToList, [])
        .forEach((results) => {
          assert.deepEqual(results, events);
        })
    ));
  });

  it('should include the metadata', () => {
    const key = uuid.v4();
    const inserts = insertEvents(key, 3);

    return inserts.then(() => (
      database.observable(key, {includeMetadata: true, stream: false})
        .reduce(reduceToList, [])
        .forEach((results) => {
          assert.equal(3, results.length);

          const [value, meta] = results[0];
          assert('id' in meta);
          assert('timestamp' in meta);
        })
    ));
  })

  it('should batch the results', () => {
    const key = uuid.v4();
    const inserts = insertEvents(key, 3);

    return inserts.then(() => (
      database.observable(key)
        .batches()
        .take(1)
        .forEach((results) => {
          assert.equal(results.length, 3);
        })
    ));
  });

  it('should skip ahead to the offset', () => {
    const key = uuid.v4();
    const inserts = insertEvents(key, 5);

    return inserts.then(() => (
      database.observable(key, 2)
        .take(3)
        .reduce(reduceToList, [] )
        .forEach((results) => {
          assert.deepEqual(results, [2,3,4]);
        })
    ));

  });
});

describe("database.shouldThrottle", () => {
  it('should throttle', () => {
    const key = uuid.v4();

    const inserts = insertEvents(key, 5);

    return inserts
        .then(() => database.shouldThrottle({key}, '10 seconds', 5))
        .then((result) => assert.equal(typeof result, 'number'));
  });

  it('should not throttle', () => {
    const key = uuid.v4();

    return database.shouldThrottle({key}, '10 seconds', 5)
      .then((result) => assert.equal(result, null));
  });
});

describe('database.storeProperty', () => {
  it('should work', () => {
    const key = uuid.v4();
    return database.storeProperty(key, "test-value", 1)
      .then(() => database.fetchProperty(key))
      .then(function(results) {
        assert.equal('test-value', results.value);
        assert.equal(1, results.version);
      })
  });

  it('should not overwrite a new value with an older value', () => {
    const key = uuid.v4();

    return database.storeProperty(key, "new-value", 2)
      .then(() => database.storeProperty(key, "old-value", 1))
      .then(() => database.fetchProperty(key))
      .then(function(results) {
        assert.equal('new-value', results.value);
        assert.equal(2, results.version);
      });
  });

  it('should overwrite an older value with an value', () => {
    const key = uuid.v4();

    return database.storeProperty(key, "old-value", 1)
      .then(() => database.storeProperty(key, "new-value", 2))
      .then(() => database.fetchProperty(key))
      .then(function(results) {
        assert.equal('new-value', results.value);
        assert.equal(2, results.version);
      });
  });
});