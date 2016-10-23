'use strict';

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _database = require('./database');

var database = _interopRequireWildcard(_database);

var _lodash = require('lodash');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_rxjs2.default.Observable.prototype.cachedProperty = function (key, accumulator, initialValue) {
  var outer = this;

  return _rxjs2.default.Observable.create(function (observer) {
    var currentValue = void 0;
    var currentVersion = void 0;
    var innerSub = void 0;

    var debouncedUpdate = (0, _lodash.debounce)(database.storeProperty, 100);

    database.fetchProperty(key).then(function (result) {
      if (typeof result === 'undefined') {
        return { value: initialValue, version: 0 };
      } else {
        return result;
      }
    }).then(function (result) {
      currentValue = result.value;
      currentVersion = result.version;

      if (typeof currentValue !== 'undefined') {
        observer.next(currentValue);
      }

      innerSub = outer.skip(result.version).subscribe(function (nextValue) {
        currentValue = accumulator(currentValue, nextValue, currentVersion);

        currentVersion++;
        debouncedUpdate(key, currentValue, currentVersion);

        observer.next(currentValue);
      });
    }, observer.error.bind(observer));

    return function () {
      if (innerSub) innerSub.unsubscribe();
    };
  });
};