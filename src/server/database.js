import Rx from 'rxjs';
import uuid from 'node-uuid';
import Pool from 'pg-pool';
import {defaults} from 'lodash';

import config from './pg_config';
import * as notifier from './notifier';

require('../batches');

const processId = uuid.v4();

const pool = new Pool(config);


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
      timestamp, actor, key, process_id, connection_id, session_id, ip_address, data
  ) VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)
  RETURNING *
`;


// Note: this won't guarantee the order of insertion. If this is important,
// wait for the promise to resolve or use insertEvents() instead
export function insertEvent(key, event, meta={}) {
  return insertEvents(key, [event], meta);
}


export function insertEvents(key, events, meta={}) {
  return pool.connect().then(function(client) {
    const values = [
      meta.actor,
      key,
      processId,
      meta.connectionId,
      meta.sessionId,
      meta.ipAddress
    ];

    function done() { client.release(); }

    const persisted = Promise.all(
      events.map((event) => (
        client.query(INSERT_SQL, values.concat({value: event}))
              .then(result => result.rows[0])
      ))
    )

    persisted.then(function() {
      notifier.notify(key);
    })

    persisted.then(done, done);

    // Note that we are returning a promise that resolves *before* the
    // notify query. This is because we want to resolve as soon as the events
    // have been persisted in the database.
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


function streamQuery(offset, key, fn) {
  return Rx.Observable.create(function(observer) {
    let maxIdReturned = 0;

    function poll() {
      return fn(maxIdReturned, offset).then(function(results) {
        let maxIdInBatch = 0;

        const filteredResults = [];

        results.forEach(function(record) {
          if (record.id > maxIdInBatch)
            maxIdInBatch = record.id;

          if (record.id > maxIdReturned) {
            filteredResults.push(record);
            offset = 0;
          }
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

    const subscription = notifier.channel(key).flatMap(poll).subscribe(observer);

    return () => subscription.unsubscribe();
  });
}


function transformEvent(row) {
  const meta = {
    id: row.id,
    timestamp: row.timestamp
  };

  if (row.process_id) {
    meta.processId = row.process_id;
  }

  if (row.session_id) {
    meta.sessionId = row.session_id;
  }

  if (row.actor) {
    meta.actor = Object.assign({}, row.actor);
    delete meta.actor.iat;
  }

  return [row.data.value, meta];
}


/*
 * options:
 *   includeMetadata: (default false)
 *   stream: (default true)
 */
export function observable(key, options={}) {
  if (typeof options === 'number') {
    options = {offset: options};
  }

  defaults(options, {includeMetadata: false, stream: true, offset: 0});

  const querySql = "SELECT * FROM events WHERE id > $1 AND key=$2 ORDER BY id ASC OFFSET $3";
  const queryParams = [key];

  let observable;
  let transformFn;

  if (options.includeMetadata) {
    transformFn = transformEvent;
  } else {
    transformFn = (row) => row.data.value;
  }

  if (options.stream) {
    observable = streamQuery(options.offset, key, (minId, offset) => (
        query(querySql, [minId, key, offset])
          .then(r => r.rows)
        ));
  } else {
    observable = Rx.Observable.fromPromise(
      query(querySql, [0, key, options.offset]).then(r => r.rows)
    );
  }

  return Rx.Observable.createFromBatches(observable.map(batch => batch.map(transformFn)));
}
