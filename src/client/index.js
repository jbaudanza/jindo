require('whatwg-fetch');

import Rx from 'rxjs';
import qs from 'qs';

import ObservablesClient from './observables_client';

function getJindoHost() {
  return [window.location.protocol, window.location.host];
}

function getJindoOrigin() {
  return window.location.origin;
}

const providersPromise = (
  fetch(getJindoOrigin() + '/providers.json', {credentials: 'include'}).then(r => r.json())
);

const [httpProtocol, hostname] = getJindoHost()
const protocol = httpProtocol === 'https:' ? 'wss:' : 'ws:';
const endpoint = `${protocol}//${hostname}`;
const observablesClient = new ObservablesClient(endpoint);

// TODO: it's probably better to just expose the ObservablesClient directly
export const reconnectingAt = observablesClient.reconnectingAt;
export const connected = observablesClient.connected;
export const observable = observablesClient.observable.bind(observablesClient);


let providers = null;
providersPromise.then(function(value) {
  providers = value;
});


export function publish(key, value, token) {
  const body = {
    sessionId: observablesClient.sessionId,
    key: key,
    value: value
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

const messageEvent = Rx.Observable.fromEvent(window, 'message');

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
