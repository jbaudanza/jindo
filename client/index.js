const Rx = require('rxjs');


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


function openSocket() {
  const socket = new WebSocket('ws://localhost:9292');
  const subscription = Rx.Observable.fromEvent(socket, 'message').subscribe(incommingMessages);

  socket.addEventListener('open', function() {
    socket.send(lastId);
    connected.onNext(true);
  });

  socket.addEventListener('close', function(event) {
    connected.onNext(false);
    // TODO: maybe event.wasClean is useful?
    //https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
    console.log('closed', event.wasClean);

    // TODO: Probably need something smarter than polling once per second
    // TODO: Check the navigator.onLine and window online/offline events
    setTimeout(openSocket, 1000);

    subscription.dispose();
  });

  socket.addEventListener('error', function(event) {
    console.log('error', event);
  });
}

openSocket();

function publish(event) {
  return fetch('/events', {
    method: 'POST',
    body: JSON.stringify(event),
    headers: {'Content-Type': 'application/json'}
  })
}

const backend = {
  events: events,
  publish: publish,
  connected: connected
};


if (typeof window === 'object') {
  window.backend = backend;
}
