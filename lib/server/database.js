'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

exports.insertEvent = insertEvent;
exports.insertEvents = insertEvents;
exports.shouldThrottle = shouldThrottle;
exports.throttled = throttled;
exports.observable = observable;
exports.fetchProperty = fetchProperty;
exports.storeProperty = storeProperty;

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _nodeUuid = require('node-uuid');

var _nodeUuid2 = _interopRequireDefault(_nodeUuid);

var _pgPool = require('pg-pool');

var _pgPool2 = _interopRequireDefault(_pgPool);

var _lodash = require('lodash');

var _pg_config = require('./pg_config');

var _pg_config2 = _interopRequireDefault(_pg_config);

var _notifier = require('./notifier');

var notifier = _interopRequireWildcard(_notifier);

var _filters = require('./filters');

var _batches = require('rxremote/batches');

var batches = _interopRequireWildcard(_batches);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var processId = _nodeUuid2.default.v4();

var pool = new _pgPool2.default(_pg_config2.default);

function query(sql, args) {
  return pool.connect().then(function (client) {
    var p = client.query(sql, args);
    function done() {
      client.release();
    }
    function error(err) {
      done();throw err;
    }

    p.then(done, error);

    return p;
  });
}

var INSERT_SQL = '\n  INSERT INTO events (\n      timestamp, actor, key, process_id, connection_id, session_id, ip_address, data\n  ) VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)\n  RETURNING *\n';

// Note: this won't guarantee the order of insertion. If this is important,
// wait for the promise to resolve or use insertEvents() instead
function insertEvent(key, event) {
  var meta = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

  return insertEvents(key, [event], meta);
}

function insertEvents(key, events) {
  var meta = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

  return pool.connect().then(function (client) {
    var values = [meta.actor, key, processId, meta.connectionId, meta.sessionId, meta.ipAddress];

    function done() {
      client.release();
    }

    var persisted = Promise.all(events.map(function (event) {
      return client.query(INSERT_SQL, values.concat({ v: event })).then(function (result) {
        return result.rows[0];
      });
    }));

    persisted.then(function () {
      notifier.notify(key);
    });

    persisted.then(done, done);

    // Note that we are returning a promise that resolves *before* the
    // notify query. This is because we want to resolve as soon as the events
    // have been persisted in the database.
    return persisted;
  });
}

function camelToUnderscore(input) {
  return input.replace(/([A-Z])/g, function ($1) {
    return "_" + $1.toLowerCase();
  });
}

function underscoreToCamel(input) {
  return input.replace(/_([a-z])/g, function ($1, $2) {
    return $2.toUpperCase();
  });
}

function shouldThrottle(filters, windowSize, maxCount) {
  // Convert the filter keys into underscores
  filters = (0, _lodash.mapKeys)(filters, function (v, k) {
    return camelToUnderscore(k);
  });

  var _toSQL = (0, _filters.toSQL)(filters);

  var _toSQL2 = _slicedToArray(_toSQL, 2);

  var filterWhere = _toSQL2[0];
  var filterValues = _toSQL2[1];


  var ageSql = '(NOW() - cast($' + (filterValues.length + 1) + ' AS interval))';

  var sql = '\n    SELECT \n      COUNT(*) AS count, (MIN(timestamp) - ' + ageSql + ') AS retryAfter\n      FROM events \n      WHERE ' + filterWhere + ' AND timestamp > ' + ageSql + '\n  ';

  // TODO: It might be more efficient to have this use the same pool as insertEvent
  var p = query(sql, filterValues.concat(windowSize));

  return p.then(function (r) {
    return r.rows[0].count >= maxCount ? r.rows[0].retryafter.seconds : null;
  });
}

function throttled(filters, windowSize, count, fn) {
  return shouldThrottle(filters, windowSize, count).then(function (retryAfter) {
    if (retryAfter == null) {
      return fn();
    } else {
      return Promise.reject({ retryAfter: retryAfter });
    }
  });
}

function streamQuery(offset, key, fn) {
  return _rxjs2.default.Observable.create(function (observer) {
    var maxIdReturned = 0;

    function poll() {
      return fn(maxIdReturned, offset).then(function (results) {
        var maxIdInBatch = 0;

        var filteredResults = [];

        results.forEach(function (record) {
          if (record.id > maxIdInBatch) maxIdInBatch = record.id;

          if (record.id > maxIdReturned) {
            filteredResults.push(record);
            offset = 0;
          }
        });

        if (maxIdInBatch > maxIdReturned) maxIdReturned = maxIdInBatch;

        return filteredResults;
      });
    }

    poll().then(function (results) {
      return observer.next(results);
    }, function (error) {
      return observer.error(error);
    });

    var subscription = notifier.channel(key).flatMap(poll).subscribe(observer);

    return function () {
      return subscription.unsubscribe();
    };
  });
}

function transformEvent(row) {
  var meta = {
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
function observable(key) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  if (typeof options === 'number') {
    options = { offset: options };
  }

  (0, _lodash.defaults)(options, { includeMetadata: false, stream: true, offset: 0 });

  function buildQuery(minId, offset) {
    var filters = Object.assign({ key: key, id: { $gt: minId } }, options.filters);

    // Convert the filter keys into underscores
    filters = (0, _lodash.mapKeys)(filters, function (v, k) {
      return camelToUnderscore(k);
    });

    var _toSQL3 = (0, _filters.toSQL)(filters);

    var _toSQL4 = _slicedToArray(_toSQL3, 2);

    var where = _toSQL4[0];
    var params = _toSQL4[1];

    params.push(offset);

    return ['SELECT * FROM events WHERE ' + where + ' ORDER BY id ASC OFFSET $' + params.length, params];
  }

  var observable = void 0;
  var transformFn = void 0;

  if (options.includeMetadata) {
    transformFn = transformEvent;
  } else {
    transformFn = function transformFn(row) {
      return row.data.v;
    };
  }

  if (options.stream) {
    observable = streamQuery(options.offset, key, function (minId, offset) {
      return query.apply(undefined, _toConsumableArray(buildQuery(minId, offset))).then(function (r) {
        return r.rows;
      });
    });
  } else {
    observable = _rxjs2.default.Observable.create(function (observer) {
      query.apply(undefined, _toConsumableArray(buildQuery(0, options.offset))).then(function (r) {
        observer.next(r.rows);observer.complete();
      }, function (error) {
        observer.error(error);
      });
    });
  }

  return batches.unwrapBatches(observable.map(function (batch) {
    return batch.map(transformFn);
  }));
}

function fetchProperty(key) {
  return query("SELECT value, version FROM jindo_properties WHERE key=$1", [key]).then(function (results) {
    if (results.rowCount > 0) {
      var row = results.rows[0];
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
var UPDATE_PROPERTY_SQL = '\n  UPDATE\n    jindo_properties\n  SET\n    value=(CASE WHEN version<$1 THEN $2 ELSE value END),\n    version=GREATEST($1, version)\n  WHERE key=$3\n';

var INSERT_PROPERTY_SQL = '\n  INSERT INTO jindo_properties (version, value, key) VALUES ($1, $2, $3)\n';

function storeProperty(key, value, version) {
  return pool.connect().then(function (client) {
    function done() {
      client.release();
    }
    function error(err) {
      done();throw err;
    }

    var params = [version, { v: value }, key];

    return client.query(UPDATE_PROPERTY_SQL, params).then(function (result) {
      // Update failed, do an insert instead
      if (result.rowCount === 0) {
        return client.query(INSERT_PROPERTY_SQL, params);
      }
    }).then(done, error);
  });
}