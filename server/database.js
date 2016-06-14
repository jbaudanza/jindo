"use strict";

const pg = require('pg');
const Rx = require('rxjs');

const conString = (
  process.env['DATABASE_URL'] || 
  "postgres://localhost/observables_development"
);

function query(sql, args) {
  return new Promise(function(resolve, reject) {
    pg.connect(conString, function(err, client, done) {
      if (err) {
        reject(err);
        return;
      }

      client.query(sql, args, function(err, result) {
        done();

        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  });
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
  return Object.assign({}, row.data, {
    id: row.id,
    timestamp: row.timestamp,
    path: row.path
  })
}


function streamEvents(minId, origin) {
  return streamQuery(minId, (minId) => (
    query("SELECT * FROM events WHERE id > $1 AND origin= $2", [minId, origin])
      .then(r => r.rows.map(transformEvent))
  ));
}

module.exports = {query, notifications, streamEvents};
