import assert from 'assert';
import Rx from 'rxjs';
import uuid from 'node-uuid';

require('../src/server/cachedProperty');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('cachedProperty', () => {
  it('should start where the last subscription left off', () => {
    const key = uuid.v4();

    const source = Rx.Observable.range(1, 5)
      .cachedProperty(key, (i, j) => i + j, 0);

    return source
        .bufferCount(6)
        .take(1)
        .forEach(function(results) {
          assert.deepEqual(results, [0,1,3,6,10, 15])
        })
        .then(() => wait(200))
        .then(function() {
          return source.take(1).forEach(function(result) {
            assert.equal(result, 15);
          });
        });
  })
});
