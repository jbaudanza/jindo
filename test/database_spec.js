import assert from 'assert';
import Rx from 'rxjs';
import uuid from 'node-uuid';
import {times} from 'lodash';

import * as database from '../src/server/database';


function insertEvents(key, count) {
  return database.insertEvents(key, times(count, i => ({number: i+1})));
}

describe("database.observable", () => {
  it('should work', () => {
    const key = uuid.v4();
    const inserts = insertEvents(key, 3);

    return inserts.then(() => (
      database.observable(key)
        .take(3)
        .reduce((list, item) => list.concat(item), [])
        .forEach((results) => {
          assert.equal(3, results.length);
        })
    ));
  });

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
        .reduce((l, i) => l.concat(i), [])
        .forEach((results) => {
          assert.deepEqual([3,4,5], results.map(e => e.number));
        })
    ));

  });
});
