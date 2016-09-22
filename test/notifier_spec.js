import assert from 'assert';
import Rx from 'rxjs';

import * as notifier from '../src/server/notifier';

function collectFromChannel(channel) {
  return notifier
    .channel(channel)
    .bufferTime(500)
    .take(1)
    .toPromise()
}

describe("notifier", () => {
  it('should notify the correct channel', () => {
    const promise = Promise.all([
      collectFromChannel('foo'),
      collectFromChannel('bar')
    ]);

    notifier.notify('foo');

    return promise.then(function([foo, bar]) {
      assert.equal(1, foo.length);
      assert.equal(0, bar.length);
    });
  });


  it('should notify the correct channel2', () => {
    const promise = Promise.all([
      collectFromChannel('foo'),
      collectFromChannel('bar')
    ]);

    notifier.notify('foo');

    return promise.then(function([foo, bar]) {
      assert.equal(1, foo.length);
      assert.equal(0, bar.length);
    });
  });

});
