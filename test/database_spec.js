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
        assert.equal(3, results.length);

        // Insert some more events and check to make sure they are also
        // streamed
        insertEvents(key, 3);

        return observable.take(6).reduce(reduceToList, []).toPromise();
      }).then(function(results) {
        assert.equal(6, results.length);
      })
  });

  it('should return a set of results and then end', () => {
    const key = uuid.v4();
    const inserts = insertEvents(key, 3);

    return inserts.then(() => (
      database.observable(key, 0, {stream: false})
        .reduce(reduceToList, [])
        .forEach((results) => {
          assert.equal(3, results.length);
        })
    ));
  });

  it('should include the metadata', () => {
    const key = uuid.v4();
    const inserts = insertEvents(key, 3);

    return inserts.then(() => (
      database.observable(key, 0, {includeMetadata: true, stream: false})
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
          assert.equal(3, results.length);
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
          assert.deepEqual([2,3,4], results);
        })
    ));

  });
});
