require('whatwg-fetch');

const Rx = require('rxjs');
const qs = require('qs');

const presenceEvents = new Rx.Subject();
const incommingMessages = new Rx.Subject();
const connected = new Rx.ReplaySubject(1);

const events = incommingMessages
  .filter(msg => msg.type === 'events')
  .flatMap(msg => Rx.Observable.from(msg.list));

let lastId = 0;

events.subscribe(function(event) {
  if (event.id > lastId) {
    lastId = event.id
  }
});


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
  const tags = document.getElementsByTagName('script');
  for (let i=0; i<tags.length; i++) {
    const tag = tags[i];
    const match = tag.src.match(/(https?:)\/\/([\w\.\:\d]+)\/jindo\.js$/)
    if (match) {
      return [match[1], match[2]];
    }
  }
  return ['https:', "www.jindo.io"];
}

function getJindoOrigin() {
  return getJindoHost().join('//')
}

function openSocket() {
  const [httpProtocol, hostname] = getJindoHost()
  const protocol = httpProtocol === 'https:' ? 'wss:' : 'ws:';
  const endpoint = `${protocol}//${hostname}`;

  const socket = new WebSocket(endpoint);
  const subscription = Rx.Observable.fromEvent(socket, 'message')
      .map(e => JSON.parse(e.data))
      .subscribe(incommingMessages);

  function send(object) {
    socket.send(JSON.stringify(object));
  }

  socket.addEventListener('open', function() {
    send({
      type: 'subscribe',
      minId: lastId
    });
    failures = 0;
    connected.next(true);
  });

  socket.addEventListener('close', function(event) {
    connected.next(false);
    // TODO: maybe event.wasClean is useful?
    //https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent

    failures += 1;

    // TODO: expose a countdown timer somehow
    // TODO: Check the navigator.onLine and window online/offline events
    const delay = Math.pow(2, failures) * 1000;
    setTimeout(openSocket, delay);

    subscription.unsubscribe();
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


function publish(event, token) {
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
      body: JSON.stringify(event),
      headers: headers
    }).then(r => r.json())
  });
}


let authFunc = null;

function authenticate(providerName) {
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

const replayEvents = new Rx.ReplaySubject(1000);
events.subscribe(replayEvents);

function join(joinEvent, partEvent, token) {
  presenceEvents.next({
    joinEvent: jointEvent,
    partEvent: partEvent,
    token: token
  });
}

const jindo = {
  events: replayEvents,
  publish: publish,
  connected: connected,
  authenticate: authenticate,
  join: join
};


if (typeof window === 'object') {
  window.jindo = jindo;
}
