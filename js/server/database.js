"use strict";

const pg = require('pg');
const Rx = require('rxjs');

const conString = (
  process.env['DATABASE_URL'] || 
  "postgres://localhost/observables_development"
);


function openConnection() {
  return new Promise(function(resolve, reject) {
    pg.connect(conString, function(err, client, done) {
      if (err) {
        reject(err);
      } else {
        resolve([client, done]);
      }
    });
  });
}


function connectAndRun(callback) {
  return openConnection().then(function(array) {
    const client = array[0];
    const done = array[1];

    const promise = callback(client);
    promise.then(done);
    return promise;
  });
}


function queryWithPromise(client, sql, args) {
  return new Promise(function(resolve, reject) {
    client.query(sql, args, function(err, result) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}


function query(sql, args) {
  return connectAndRun(function(client) {
    return queryWithPromise(client, sql, args);
  });
}


const INSERT_SQL = `
  INSERT INTO events (
      timestamp, actor, name, process_id, connection_id, session_id, ip_address, data
  ) VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING *
`;


function insertEvent(event, actor, name, processId, connectionId, sessionId, ip) {
  return openConnection().then(function(array) {
    const client = array[0];
    const done = array[1];

    const promise = queryWithPromise(
      client, INSERT_SQL, [actor, name, processId, connectionId, sessionId, ip, event]
    ).then((result) => transformEvent(result.rows[0]));

    promise
      .then(() => queryWithPromise(client, 'NOTIFY events'))
      .then(done, done);

    return promise;
  });
}


function shouldThrottle(ipAddress, windowSize, maxCount) {
  const sql = `
    SELECT 
      COUNT(*) AS count, (MIN(timestamp) - (NOW() - cast($2 AS interval))) AS retryAfter 
      FROM events 
      WHERE ip_address=$1 AND timestamp > (NOW() - cast($2 AS interval))
  `;

  const p = query(sql, [ipAddress, windowSize]);

  return p.then(r => (
    r.rows[0].count >= maxCount) ? r.rows[0].retryafter.seconds : null
  );
}


const notifications = new Rx.Subject();

pg.connect(conString, function(err, client, done) {
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

  return Rx.Observable.merge(
    poll(),
    notifications.flatMap(poll)
  ).filter(list => list.length > 0)
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


function streamEvents(minId, name) {
  let querySql = "SELECT * FROM events WHERE id > $1";
  let queryParams = [];

  if (name) {
    querySql += " AND name=$2";
    queryParams.push(name);
  }

  return streamQuery(minId, (minId) => (
    query(querySql, [minId].concat(queryParams))
      .then(r => r.rows.map(transformEvent))
  ));
}

module.exports = {query, notifications, streamEvents, insertEvent, shouldThrottle};
