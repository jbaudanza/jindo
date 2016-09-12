import pg from 'pg';
import Rx from 'rxjs';
import uuid from 'node-uuid';
import Pool from 'pg-pool';
import url from 'url';

const processId = uuid.v4();

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

if (params.part) {
  config.port = params.port;
}

if (params.auth) {
  const auth = params.auth.split(':');
  config.user = auth[0];
  config.password = auth[1];
}

const pool = new Pool(config);

function openConnection() {
  return new Promise(function(resolve, reject) {
    pool.connect(function(err, client, done) {
      if (err) {
        reject(err);
      } else {
        resolve([client, done]);
      }
    });
  });
}


function query(sql, args) {
  return pool.connect().then(function(client) {
    const p = client.query(sql, args);
    function done() { client.release(); }
    p.then(done, done);

    return p;
  });
}


const INSERT_SQL = `
  INSERT INTO events (
      timestamp, actor, name, process_id, connection_id, session_id, ip_address, data
  ) VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)
  RETURNING *
`;


export function insertEvent(name, event, meta={}) {
  return pool.connect().then(function(client) {
    const values = [
      meta.actor,
      name,
      processId,
      meta.connectionId,
      meta.sessionId,
      meta.ipAddress,
      event
    ];

    function done() { client.release() }

    const persisted = client.query(INSERT_SQL, values).then(result => result.rows[0]);

    persisted
      .then(() => client.query('NOTIFY events'))
      .then(done, done);

    // Note that we are returning a promise that resolves *before* the
    // notify query. This is because we want to resolve as soon as the event
    // as been persisted in the database.
    return persisted;
  });
}


export function shouldThrottle(ipAddress, windowSize, maxCount) {
  const sql = `
    SELECT 
      COUNT(*) AS count, (MIN(timestamp) - (NOW() - cast($2 AS interval))) AS retryAfter 
      FROM events 
      WHERE ip_address=$1 AND timestamp > (NOW() - cast($2 AS interval))
  `;

  // TODO: It might be more efficient to have this use the same pool as insertEvent
  const p = query(sql, [ipAddress, windowSize]);

  return p.then(r => (
    r.rows[0].count >= maxCount) ? r.rows[0].retryafter.seconds : null
  );
}


const notifications = new Rx.Subject();

pool.connect(function(err, client, done) {
  if (err) {
    notifications.error(err);
  } else {
    client.on('notification', function(event) {
      notifications.next(event);
    });

    client.query('LISTEN events');
  }
});


function streamQuery(minId, fn) {
  // TODO: If the downstream observer is a SkipSubscriber, we can move the
  // skipping into SQL.
  return Rx.Observable.create(function(observer) {
    let maxIdReturned = minId;

    function poll() {
      return fn(maxIdReturned).then(function(results) {
        let maxIdInBatch = 0;

        const filteredResults = [];

        results.forEach(function(record) {
          if (record.id > maxIdInBatch)
            maxIdInBatch = record.id;

          if (record.id > maxIdReturned)
            filteredResults.push(record);
        });

        if (maxIdInBatch > maxIdReturned)
          maxIdReturned = maxIdInBatch;

        return filteredResults;
      });
    }

    poll()
      .then(
        (results) => observer.next(results),
        (error) => observer.error(error)
      );

    const subscription = notifications.flatMap(poll).subscribe(observer);

    return () => subscription.unsubscribe();
  }).filter(list => list.length > 0);
}


function transformEvent(row) {
  const obj = Object.assign({}, row.data, {
    id: row.id,
    timestamp: row.timestamp
  });

  if (row.path) {
    obj.path = row.path;
  }

  if (row.process_id) {
    obj.processId = row.process_id;
  }

  if (row.session_id) {
    obj.sessionId = row.session_id;
  }

  if (row.actor) {
    obj.actor = Object.assign({}, row.actor);
    delete obj.actor.iat;
  }

  return obj;
}


export function observable(name, minId=0) {
  const querySql = "SELECT * FROM events WHERE id > $1 AND name=$2 ORDER BY id ASC";
  const queryParams = [name];

  return streamQuery(minId, (minId) => (
    query(querySql, [minId].concat(queryParams))
      .then(r => r.rows.map(transformEvent))
  ));
}
