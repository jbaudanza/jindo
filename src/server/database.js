import Rx from 'rxjs';
import uuid from 'node-uuid';
import Pool from 'pg-pool';
import {defaults, mapKeys} from 'lodash';

import config from './pg_config';
import * as notifier from './notifier';
import {toSQL} from './filters';

require('../batches');

const processId = uuid.v4();

const pool = new Pool(config);


function query(sql, args) {
  return pool.connect().then(function(client) {
    const p = client.query(sql, args);
    function done() { client.release(); }
    function error(err) { done(); throw err; }

    p.then(done, error);

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
        client.query(INSERT_SQL, values.concat({v: event}))
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


function camelToUnderscore(input: string): string {
  return input.replace(/([A-Z])/g, ($1) => "_"+$1.toLowerCase());
}


function underscoreToCamel(input: string): string {
  return input.replace(/_([a-z])/g, ($1, $2) => $2.toUpperCase());
}


export function shouldThrottle(filters, windowSize, maxCount) {
  // Convert the filter keys into underscores
  filters = mapKeys(filters, (v, k) => camelToUnderscore(k));

  const [filterWhere, filterValues] = toSQL(filters);

  const ageSql = `(NOW() - cast($${filterValues.length + 1} AS interval))`;

  const sql = `
    SELECT 
      COUNT(*) AS count, (MIN(timestamp) - ${ageSql}) AS retryAfter
      FROM events 
      WHERE ${filterWhere} AND timestamp > ${ageSql}
  `;

  // TODO: It might be more efficient to have this use the same pool as insertEvent
  const p = query(sql, filterValues.concat(windowSize));

  return p.then(r => (
    r.rows[0].count >= maxCount) ? r.rows[0].retryafter.seconds : null
  );
}


export function throttled(filters, windowSize, count, fn) {
  return shouldThrottle(filters, windowSize, count).then(function(retryAfter) {
    if (retryAfter == null) {
      return fn();
    } else {
      return Promise.reject({retryAfter: retryAfter});
    }
  });
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

  return [row.data.v, meta];
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
    transformFn = (row) => row.data.v;
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

export function fetchProperty(key) {
  return query(
    "SELECT value, version FROM jindo_properties WHERE key=$1", [key]
  ).then(function(results) {
    if (results.rowCount > 0) {
      const row = results.rows[0];
      return {
        value: row.value.v,
        version: row.version
      };
    }
  });
}

/*
   This query is designed to update the row even if doesn't make any changes.
   This is because we need to detect the case when the row doesn't exist and
   needs to be inserted.
   params: [version, value, key]
 */
const UPDATE_PROPERTY_SQL = `
  UPDATE
    jindo_properties
  SET
    value=(CASE WHEN version<$1 THEN $2 ELSE value END),
    version=GREATEST($1, version)
  WHERE key=$3
`;

const INSERT_PROPERTY_SQL = `
  INSERT INTO jindo_properties (version, value, key) VALUES ($1, $2, $3)
`;

export function storeProperty(key, value, version) {
  return pool.connect().then(function(client) {
    function done() { client.release(); }
    function error(err) { done(); throw err; }

    const params = [version, {v: value}, key];

    return client
      .query(UPDATE_PROPERTY_SQL, params)
      .then(function(result) {
        // Update failed, do an insert instead
        if (result.rowCount === 0) {
          return client.query(INSERT_PROPERTY_SQL, params);
        }
      })
      .then(done, error);
  });
}
