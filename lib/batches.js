'use strict';

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_rxjs2.default.Observable.createFromBatches = function (batched) {
  const obs = batched.flatMap(x => _rxjs2.default.Observable.from(x));

  batched = batched.filter(l => l.length > 0);

  // Override the prototype version
  batched.batches = obs.batches = function () {
    return batched;
  };

  return obs;
};

_rxjs2.default.Observable.prototype.batches = function () {
  return this.map(x => [x]);
};

_rxjs2.default.Observable.prototype.batchScan = function (fn, initial) {
  return this.batches().scan((state, batch) => batch.reduce(fn, state), initial);
};

_rxjs2.default.Observable.prototype.batchSkip = function (count) {
  if (count === 0) return this;

  const batches = this.batches();
  return _rxjs2.default.Observable.create(function (observer) {
    let leftToSkip = count;

    const sub = batches.map(function (batch) {
      if (leftToSkip === 0) {
        return batch;
      }
      if (batch.length <= leftToSkip) {
        leftToSkip -= batch.length;
        return [];
      } else {
        const result = batch.slice(leftToSkip);
        leftToSkip = 0;
        return result;
      }
    }).filter(l => l.length > 0).subscribe(observer);
    return sub.unsubscribe.bind(sub);
  });
};