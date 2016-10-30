import Rx from 'rxjs';
import pg from 'pg';

import config from './pg_config';

const client = new pg.Client(config);
const connectedClient = Rx.Observable.bindNodeCallback(client.connect.bind(client))();

export function channel(key) {
  return connectedClient.flatMap(function(client) {
    return Rx.Observable.create(function(observer) {

      if (!('subscriptionRefCounts' in client)) {
        client.subscriptionRefCounts = {};
      }

      if (!(key in client.subscriptionRefCounts)) {
        client.subscriptionRefCounts[key] = 0;
      }

      if (client.subscriptionRefCounts[key] === 0) {
        client.query('LISTEN ' + client.escapeIdentifier(key));
      }

      client.subscriptionRefCounts[key]++;

      function listener(event) {
        if (event.channel === key) {
          observer.next(event.payload);
        }      
      }

      client.on('notification', listener);

      return function() {
        client.subscriptionRefCounts[key]--;

        if (client.subscriptionRefCounts[key] === 0) {
          client.query('UNLISTEN ' + client.escapeIdentifier(key));
        }
        client.removeListener('notification', listener);
      };
    });
  });
}

export function notify(channel, message) {
  return connectedClient.forEach(function(client) {
    client.query(
      'NOTIFY ' + client.escapeIdentifier(channel) + ", " + client.escapeLiteral(message)
    );
  });
}
