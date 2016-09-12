require('whatwg-fetch');

const Rx = require('rxjs');
const qs = require('qs');
const uuid = require('node-uuid');

const connectedSubject = new Rx.BehaviorSubject(false);

const incommingMessages = new Rx.Subject();
export const connected = connectedSubject.asObservable();

const reconnectingAtSubject = new Rx.BehaviorSubject(null);
export const reconnectingAt = reconnectingAtSubject.asObservable();

const subscribes = new Rx.Subject();
const unsubscribes = new Rx.Subject();


const subscriptionState = {};

subscribes.subscribe(function(subscriptionInfo) {
  subscriptionState[subscriptionInfo.subscriptionId] = subscriptionInfo;
});

unsubscribes.subscribe(function(subscriptionId) {
  delete subscriptionState[subscriptionId];
});


incommingMessages.subscribe(onMessage);


function onMessage(message) {
  if (message.subscriptionId in subscriptionState) {
    const state = subscriptionState[message.subscriptionId];
    switch (message.type) {
      case 'error':
        state.observer.error(message.error);
        break;
      case 'events':
        message.list.forEach(function(event) {
          state.observer.next(event)
          state.lastId = event.id;
        });
        break;
    }
  }
}


const sessionId = uuid.v4();

function isOnline() {
  if ('onLine' in navigator)
    return navigator.onLine;
  else
    return true;
}

function isOffline() {
  return !isOnline();
}


// TODO: when triggered, we should try to reconnect if we're not already connected
const onlineEvent = Rx.Observable.fromEvent(window, 'online');
const messageEvent = Rx.Observable.fromEvent(window, 'message');

let failures = 0;

function getJindoHost() {
  return [window.location.protocol, window.location.host];
}

function getJindoOrigin() {
  return window.location.origin;
}

function openSocket() {
  const [httpProtocol, hostname] = getJindoHost()
  const protocol = httpProtocol === 'https:' ? 'wss:' : 'ws:';
  const endpoint = `${protocol}//${hostname}`;

  const socket = new WebSocket(endpoint);
  const cleanup = [];

  const messageStream = Rx.Observable.fromEvent(socket, 'message')
      .map(e => JSON.parse(e.data));

  cleanup.push(
    messageStream.subscribe(incommingMessages)
  );

  function send(object) {
    socket.send(JSON.stringify(object));
  }

  function sendSubscribe(subscriptionInfo) {
    send({
      type: 'subscribe',
      name: subscriptionInfo.name,
      minId: subscriptionInfo.lastId,
      subscriptionId: subscriptionInfo.subscriptionId
    });
  }

  function sendUnsubscribe(subscriptionInfo) {
    send({
      type: 'unsubscribe',
      name: subscriptionInfo.name
    });
  }

  socket.addEventListener('open', function() {
    send({
      type: 'hello', sessionId: sessionId
    });

    Object.keys(subscriptionState).forEach(function(subscriptionId) {
      sendSubscribe(subscriptionState[subscriptionId]);
    });

    cleanup.push(subscribes.subscribe(sendSubscribe));
    cleanup.push(unsubscribes.subscribe(sendUnsubscribe));

    failures = 0;
    connectedSubject.next(true);
    reconnectingAtSubject.next(null);
  });

  socket.addEventListener('close', function(event) {
    connectedSubject.next(false);
    // TODO: maybe event.wasClean is useful?
    //https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent

    failures += 1;

    // TODO: Check the navigator.onLine and window online/offline events
    const delay = Math.pow(2, failures) * 1000;
    setTimeout(openSocket, delay);
    reconnectingAtSubject.next(Date.now() + delay);

    cleanup.forEach((sub) => sub.unsubscribe());
  });
}

openSocket();

const providersPromise = (
  fetch(getJindoOrigin() + '/providers.json', {credentials: 'include'}).then(r => r.json())
);

let providers = null;
providersPromise.then(function(value) {
  providers = value;
});


// TODO: Consider make this an observer instead: jindo.stream('foobar').next(event)
export function publish(name, event, token) {
  const body = {
    sessionId: sessionId,
    name: name,
    event: event
  };

  // TODO: Kind of weird to put the csrf token on the providers list
  return providersPromise.then(function(providers) {
    const headers = {
      'Content-Type': 'application/json',
      'csrf-token': providers.csrf
    };

    if (token) {
      headers['Authorization'] = "Bearer " + token;
    }

    return fetch(getJindoOrigin() + '/events', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(body),
      headers: headers
    }).then(r => r.json())
  });
}


let authFunc = null;

export function authenticate(providerName) {
  if (!providerName)
    providerName = 'github';

  if (!providers)
    return;

  if (!(providerName in providers)) {
    throw "Unknown authentication provider"
  }

  const provider = providers[providerName];

  const url = provider.authUrl + "?" + qs.stringify({
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      response_type: 'code',
      state: providers.csrf + "|" + window.location.origin
  });

  const popup = window.open(url, 'login', 'width=620,height=600');

  return new Promise(function(resolve, reject) {
    authFunc = function(object) {
      popup.close();
      // TODO: check for errors here
      resolve(object);
    };
  });
}

let subscriptionCounter = 0;

export function observable(name, howMany) {
  return Rx.Observable.create(function(observer) {
    const subscriptionId = subscriptionCounter;
    subscriptionCounter++;

    subscribes.next({
      observer: observer,
      name: name,
      subscriptionId: subscriptionId,
      lastId: 0
    });

    return function() {
      unsubscribes.next(subscriptionId);
    }
  });
}

messageEvent.subscribe(function(event) {
  if (!authFunc)
    return;

  const obj = event.data;

  if (typeof(obj) !== 'object' || obj.type !== 'jindo-authentication')
    return;

  if (event.origin !== getJindoOrigin())
    return;

  authFunc(obj.token);
  authFunc = null;
});
