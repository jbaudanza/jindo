import assert from 'assert';
import Rx from 'rxjs';
import uuid from 'node-uuid';

import * as database from '../src/server/database';


describe("database.observable", () => {
  it('should work', () => {
    const key = uuid.v4();

    const inserts = Promise.all([
      database.insertEvent(key, {number: 1}),
      database.insertEvent(key, {number: 2}),
      database.insertEvent(key, {number: 3})
    ]);

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

    const inserts = Promise.all([
      database.insertEvent(key, {number: 1}),
      database.insertEvent(key, {number: 2}),
      database.insertEvent(key, {number: 3})
    ]);

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

    const inserts = Promise.all([
      database.insertEvent(key, {number: 1}),
      database.insertEvent(key, {number: 2}),
      database.insertEvent(key, {number: 3}),
      database.insertEvent(key, {number: 4}),
      database.insertEvent(key, {number: 5})
    ]);

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
