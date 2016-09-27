import assert from 'assert';
import Rx from 'rxjs';
import uuid from 'node-uuid';

require('../src/server/snapshotLatest');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


describe('snapshotLatest', () => {
  it('should start where the last subscription left off', () => {
    function orderFn(i,j) { return i < j; }

    const key = uuid.v4();
    const source = Rx.Observable.range(0, 10)
      .snapshotLatest(key, orderFn, () => true);

    return source
        .bufferCount(10)
        .take(1)
        .forEach(function(results) {
          assert.equal(10, results.length)
        })
        .then(() => wait(200))
        .then(function() {
          return source.take(1).forEach(function(result) {
            assert.equal(9, result)
          });
        });
  })
});
