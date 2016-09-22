import Rx from 'rxjs';
import pg from 'pg';

import config from './pg_config';

const client = new pg.Client(config);
const connectedClient = Rx.Observable.bindNodeCallback(client.connect.bind(client))();

export function channel(key) {
  return connectedClient.flatMap(function(client) {
    return Rx.Observable.create(function(observer) {
      client.query('LISTEN ' + key);

      function listener(event) {
        if (event.channel === key) {
          observer.next(event);
        }      
      }

      client.on('notification', listener);

      return function() {
        client.query('UNLISTEN ' + key);
        client.removeListener('notification', listener);
      };
    });
  });
}

export function notify(channel) {
  return connectedClient.forEach(function(client) {
    client.query('NOTIFY ' + channel);
  });
}