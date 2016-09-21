import Rx from 'rxjs';
import uuid from 'node-uuid';

require('../batches');

const sessionId = uuid.v4();

let WebSocketClient;
if (typeof window === 'object') {
  WebSocketClient = window.WebSocket;
} else {
  WebSocketClient = require('ws');

  // This was copied from https://github.com/websockets/ws/pull/805/files.
  // If this PR ever gets accepted, we can remove this.
  WebSocketClient.prototype.removeEventListener = function(method, listener) {
    var listeners = this.listeners(method);
    for (var i = 0; i < listeners.length; i++) {
      if (listeners[i]._listener === listener) {
        this.removeListener(method, listeners[i]);
      }
    }
  };
  
  WebSocketClient.prototype.hasEventListener = function(method, listener) {
    var listeners = this.listeners(method);
    for (var i = 0; i < listeners.length; i++) {
      if (listeners[i]._listener === listener) {
        return true;
      }
    }
    return false;
  };
}


function isOnline() {
  if ('onLine' in navigator)
    return navigator.onLine;
  else
    return true;
}

function isOffline() {
  return !isOnline();
}


function openSocket(endpoint, privateState, failures) {
  const socket = new WebSocketClient(endpoint);
  const cleanup = [];

  const messageStream = Rx.Observable.fromEvent(socket, 'message')
      .map(e => JSON.parse(e.data));

  cleanup.push(
    messageStream.subscribe(privateState.incomingMessages)
  );

  function send(object) {
    socket.send(JSON.stringify(object));
  }

  function sendSubscribe(subscriptionInfo) {
    send({
      type: 'subscribe',
      name: subscriptionInfo.name,
      sequence: subscriptionInfo.sequence,
      subscriptionId: subscriptionInfo.subscriptionId
    });
  }

  function sendUnsubscribe(subscriptionId) {
    send({
      type: 'unsubscribe',
      subscriptionId: subscriptionId
    });
  }

  socket.addEventListener('open', function() {
    send({
      type: 'hello', sessionId: sessionId
    });

    Object.keys(privateState.subscriptionState).forEach(function(subscriptionId) {
      sendSubscribe(privateState.subscriptionState[subscriptionId]);
    });

    cleanup.push(privateState.subscribes.subscribe(sendSubscribe));
    cleanup.push(privateState.unsubscribes.subscribe(sendUnsubscribe));

    failures = 0;
    privateState.connectedSubject.next(true);
    privateState.reconnectingAtSubject.next(null);
  });

  socket.addEventListener('close', function(event) {
    privateState.connectedSubject.next(false);
    // TODO: maybe event.wasClean is useful?
    //https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent

    // TODO: Check the navigator.onLine and window online/offline events
    const delay = Math.pow(2, failures) * 1000;
    setTimeout(() => openSocket(endpoint, privateState, failures+1), delay);
    privateState.reconnectingAtSubject.next(Date.now() + delay);

    cleanup.forEach((sub) => sub.unsubscribe());
  });
}


export default class ObservablesClient {
  constructor(endpoint) {
    const privateState = {
      incomingMessages: new Rx.Subject(),
      connectedSubject: new Rx.BehaviorSubject(false),
      reconnectingAtSubject: new Rx.BehaviorSubject(null),
      subscriptionState: {},
      subscribes: new Rx.Subject(),
      unsubscribes: new Rx.Subject(),
      subscriptionCounter: 0
    }

    this.privateState = privateState;
    this.connected = privateState.connectedSubject.asObservable();
    this.reconnectingAt = privateState.reconnectingAtSubject.asObservable();
    this.sessionId = sessionId;

    openSocket(endpoint, privateState, 0);

    privateState.subscribes.subscribe(function(subscriptionInfo) {
      privateState.subscriptionState[subscriptionInfo.subscriptionId] = subscriptionInfo;
    });

    privateState.unsubscribes.subscribe(function(subscriptionId) {
      delete privateState.subscriptionState[subscriptionId];
    });

    privateState.incomingMessages.subscribe(onMessage);


    function onMessage(message) {
      if (message.subscriptionId in privateState.subscriptionState) {
        const state = privateState.subscriptionState[message.subscriptionId];
        switch (message.type) {
          case 'error':
            state.observer.error(message.error);
            break;
          case 'complete':
            state.observer.complete();
            break;
          case 'events':
            state.sequence += message.batch.length;
            state.observer.next(message.batch);
            break;
        }
      }
    }

    // TODO: when triggered, we should try to reconnect if we're not already connected
    //const onlineEvent = Rx.Observable.fromEvent(window, 'online');
  }

  observable(name) {
    const privateState = this.privateState;

    const batches = Rx.Observable.create(function(observer) {
      const subscriptionId = privateState.subscriptionCounter;
      privateState.subscriptionCounter++;

      privateState.subscribes.next({
        observer: observer,
        name: name,
        subscriptionId: subscriptionId,
        sequence: 0
      });

      return function() {
        privateState.unsubscribes.next(subscriptionId);
      }
    });

    return Rx.Observable.createFromBatches(batches);
  }

}
