import Rx from 'rxjs';
import Pool from 'pg-pool';
import url from 'url';

// XXX: Connection stuff is duplicated
// TODO: Since these are long lived connections, perhaps they shouldn't be
// using a pool instead
let conString;

if (process.env['NODE_ENV'] === 'test') {
  conString = "postgres://localhost/jindo_test";
} else if (process.env['DATABASE_URL']) {
  conString = process.env['DATABASE_URL'];
} else {
  conString = "postgres://localhost/observables_development";
}

// TODO: Maybe url parsing shouldnt be part of this module
const params = url.parse(conString);

const config = {
  host: params.hostname,
  database: params.pathname.split('/')[1]
  //ssl: true
};

const pool = new Pool(config);

// const notificationClient = Rx.Observable.create(function(observer) {
//   let outerDone=null;
//   let cancelled=false;

//   pool.connect(function(err, client, done) {
//     console.log('connected')
//     if (err) {
//       observer.error(err);
//     } else {
//       observer.next(client);
//     }
//   });

//   return function() {
//     console.log('unsubscribing')
//     if (outerDone) {
//       outerDone();
//       outerDone = null;
//     }
//     cancelled = true;
//   };
// }).publish().refCount();

const notificationClient = Rx.Observable.fromPromise(pool.connect());


export function channel(key) {
  return notificationClient.flatMap(function(client) {
    console.log(typeof client)
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
  return pool.connect().then(function(client) {
    client.query('NOTIFY ' + channel);
    client.release();
  });
}