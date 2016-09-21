import assert from 'assert';
import Rx from 'rxjs';

import ObservablesServer from '../src/server/observables_server';
import ObservablesClient from '../src/client/observables_client';

import http from 'http';

function createHttpServer() {
  const httpServer = http.createServer();
  return new Promise(function(resolve, reject) {
    httpServer.listen({host: '0.0.0.0', port: 0}, () => resolve(httpServer));
  });
}


describe('ObservableServer', () => {
  it('should work', () => {
    return createHttpServer().then(function(httpServer) {
      const observablesServer = new ObservablesServer();
      observablesServer.attachToHttpServer(httpServer); // XXX: Move this back into constructor?
      //observablesServer.log.subscribe(x => console.log(x))

      const addr = httpServer.address();
      const endpoint = `ws://${addr.address}:${addr.port}`;

      const observablesClient = new ObservablesClient(endpoint);

      observablesServer.cold('test-observable', () => Rx.Observable.from([1,2,3,4]));

      return observablesClient.observable('test-observable')
          .take(4)
          .reduce((l, i) => l.concat(i), [])
          .forEach(function(l) {
            assert.deepEqual(l, [1,2,3,4]);
          });
    })
  })
});
