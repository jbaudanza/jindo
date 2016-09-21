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


function createClientServerPair() {
  return createHttpServer().then(function(httpServer) {
    const observablesServer = new ObservablesServer(httpServer);
    const addr = httpServer.address();
    const endpoint = `ws://${addr.address}:${addr.port}`;
    const observablesClient = new ObservablesClient(endpoint);
    //observablesServer.log.subscribe(x => console.log(x))

    return [observablesServer, observablesClient];
  });
}


describe('ObservableServer', () => {
  it('should serve a normal observable', () => {
    return createClientServerPair().then(function([server, client]) {
      server.cold('test-observable', () => Rx.Observable.from([1,2,3,4]));

      return client.observable('test-observable')
          .reduce((l, i) => l.concat(i), [])
          .forEach(function(l) {
            assert.deepEqual(l, [1,2,3,4]);
          });
    });
  });

  it('should propogate errors to the client', () => {
    return createClientServerPair().then(function([server, client]) {
      server.cold('test-observable', () => Rx.Observable.throw('Test error'));

      return client.observable('test-observable')
        .toPromise()
        .then(
          function(result) { throw new Error('Promise was unexpectedly fulfilled. Result: ' + result) },
          function(err) { assert.equal("Test error", err); }
        )
    });
  });
});
