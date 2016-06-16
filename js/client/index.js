const Rx = require('rxjs');
const qs = require('qs');

window.Rx = Rx;

const incommingMessages = new Rx.Subject();
const connected = new Rx.Subject();

const events = incommingMessages
  .map(e => JSON.parse(event.data))
  .flatMap(e => e);

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


let failures = 0;


function openSocket() {
  const protocol = document.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const endpoint = `${protocol}//${document.location.hostname}:${document.location.port}`;

  const socket = new WebSocket(endpoint);
  const subscription = Rx.Observable.fromEvent(socket, 'message').subscribe(incommingMessages);

  socket.addEventListener('open', function() {
    socket.send(lastId);
    failures = 0;
    connected.next(true);
  });

  socket.addEventListener('close', function(event) {
    connected.next(false);
    // TODO: maybe event.wasClean is useful?
    //https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
    console.log('closed', event.wasClean, event.code);

    failures += 1;

    // TODO: expose a countdown timer somehow
    // TODO: Check the navigator.onLine and window online/offline events
    const delay = Math.pow(2, failures) * 1000;
    setTimeout(openSocket, delay);

    subscription.unsubscribe();
  });

  socket.addEventListener('error', function(event) {
    console.log('error', event);
  });
}

openSocket();

const providersPromise = (
  fetch('/providers.json', {credentials: 'include'}).then(r => r.json())
);


function publish(event) {
  // TODO: Kind of weird to put the csrf token on the providers list
  return providersPromise.then(function(providers) {
    return fetch('/events', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(event),
      headers: {
        'Content-Type': 'application/json',
        'csrf-token': providers.csrf
      }
    })
  });
}

function authenticate() {
  providersPromise.then(function(providers) {
    const provider = providers['soundcloud'];

    const url = provider.authUrl + "?" + qs.stringify({
        client_id: provider.clientId,
        redirect_uri: provider.redirectUri,
        response_type: 'code',
        state: providers.csrf
    });

    window.open(url, 'login', 'width=620,height=600');
  });
}


const backend = {
  events: events,
  publish: publish,
  connected: connected,
  authenticate: authenticate
};


if (typeof window === 'object') {
  window.backend = backend;
}
