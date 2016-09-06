import {Server as WebSocketServer} from 'ws';
import Rx from 'rxjs';
import _ from 'lodash';


function onWebSocketConnection(socket, observables, connectionId, logSubject, eventSubject) {
  const remoteAddr = (
      socket.upgradeReq.headers['x-forwarded-for'] || 
      socket.upgradeReq.connection.remoteAddress
  );

  let sessionId = null;

  function log(message) {
    const str = `[${remoteAddr}] ${message}`;
    logSubject.next(str);
  }

  function send(object) {
    if (socket.readyState === 1) { // OPEN
      socket.send(JSON.stringify(object));
    } else {
      log(`Tried to send to WebSocket in readyState: ${socket.readyState}`)
    }
  }

  function insertEvent(event) {
    eventSubject.next(_.extend(
      {
        connectionId: connectionId,
        sessionId: sessionId,
        ipAddress: remoteAddr
      },
      event
    ));
  }

  log("WebSocket connection opened");

  let subscriptions = {};

  // This gets called when the socket is closed.
  function cleanup() {
    log("Closing WebSocket");

    _.values(subscriptions).forEach(function(sub) {
      sub.unsubscribe();
    })
    subscriptions = {};

    insertEvent({type: 'connection-closed'});
  };

  socket.on('message', function(data) {
    let message;

    try {
      message = JSON.parse(data);
    } catch(e) {
      log("Error parsing JSON");
      console.error(e);
    }

    if (typeof message.type !== 'string') {
      log("Received message without a type")  
      return;
    }

    log("received message " + message.type);

    switch (message.type) {
      case 'hello':
        if (typeof message.sessionId !== 'string') {
          log('expected sessionId');
          break;
        }
        sessionId = message.sessionId;
        insertEvent({type: 'connection-open'});
        break;

      case 'subscribe':
        if (typeof message.minId !== 'number') {
          log("expected minId number");
          break;
        }

        if (typeof message.subscriptionId !== 'number') {
          log("expected subscriptionId string");
          break;
        }

        if (message.subscriptionId in subscriptions) {
          log("subscriptionId sent twice: " + message.subscriptionId);
          break;
        }

        const fn = observables[message.name];

        if (fn) {
          const subscription = fn(message.minId, socket)
            .map((list) => ({
              type: 'events', 
              list: list, 
              subscriptionId: message.subscriptionId
            }))
            .subscribe(send);

          subscriptions[message.subscriptionId] = subscription;
        } else {
          send({
            type: 'error',
            subscriptionId: message.subscriptionId,
            error: {
              code: 404,
              message: 'Not found'
            }
          })
        }

        break;
      case 'unsubscribe':
        if (typeof message.subscriptionId !== 'number') {
          log("expected subscriptionId string");
          break;
        }

        if (!(message.subscriptionId in subscriptions)) {
          log("subscriptionId not found: " + message.subscriptionId);
          break;
        }

        subscriptions[message.subscriptionId].unsubscribe();
        delete subscriptions[message.subscriptionId];
        break;

      default:
        log(`Received unknown message type ${message.type}`)  
        return;
    }
  });

  socket.on('close', cleanup);
}


export default class ObservablesServer {
  constructor(httpServer, observables) {
    let connectionCounter = 0;

    const eventSubject = new Rx.Subject();
    const logSubject = new Rx.Subject();

    this.wss = new WebSocketServer({server: httpServer});
    this.events = eventSubject.asObservable();
    this.log = logSubject.asObservable();

    this.wss.on('connection', function(socket) {
      connectionCounter++;
      onWebSocketConnection(
          socket, observables, connectionCounter, logSubject, eventSubject
      );
    });
  }

  // cleanup() {
  //   _.invoke(this.wss.clients, 'cleanup');
  // }
}
