import assert from 'assert';
import Rx from 'rxjs';
import uuid from 'node-uuid';

import {sessions} from '../src/server/presence';

describe('presence.sessions', () => {
  it('should work', () => {
    const processId1 = uuid.v4();
    const processId2 = uuid.v4();

    const sessionId1 = uuid.v4();
    const sessionId2 = uuid.v4();

    const processEvents = Rx.Observable.of([
      {
        type: 'startup',
        processId: processId1
      },
      {
        type: 'startup',
        processId: processId2
      },
    ]);

    const connectionEvents = Rx.Observable.of([
      {
        type: 'connection-open',
        processId: processId1,
        connectionId: 0,
        sessionId: sessionId1
      },
      {
        type: 'connection-open',
        processId: processId2,
        connectionId: 0,
        sessionId: sessionId2
      },
    ]);

    return sessions(connectionEvents, processEvents)
      .take(1)
      .toPromise().then((list) => {
        assert.deepEqual(list.sort(), [sessionId1, sessionId2].sort())
      });
  });
});
