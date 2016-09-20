import assert from 'assert';
//import EventEmitter from 'events';
import Rx from 'rxjs';

import ObservablesServer from '../src/server/observables_server';
import ObservablesClient from '../src/client/observables_client';

import http from 'http';

// class MockWebSocket extends EventEmitter {
//   constructor() {
//     super();
//     this.upgradeReq = {
//       headers: {},
//       connection: {
//         remoteAddress: '192.168.1.100'
//       }
//     }
//   }
// }

// class MockWebSocketServer extends EventEmitter {
// }


function createHttpServer() {
  const httpServer = http.createServer();
  return new Promise(function(resolve, reject) {
    httpServer.listen({host: '0.0.0.0', port: 0}, () => resolve(httpServer));
  });
}


describe('ObservableServer', () => {
  // it('should work', () => {
  //   const mockWss = new MockWebSocketServer();

  //   const observablesServer = new ObservablesServer();
  //   observablesServer.attachToWebSocketServer(mockWss);

  //   const mockWs = new MockWebSocket();
  //   mockWss.emit('connection', mockWs)
  //   assert(true, 'bla')
  // });
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
