import Rx from 'rxjs';

Rx.Observable.createFromBatches = function(batched) {
  const obs = batched.flatMap((x) => Rx.Observable.from(x));

  // Override the prototype version
  batched.batches = obs.batches = function() {
    return batched.filter((l) => l.length > 0);
  };

  return obs;
}

Rx.Observable.prototype.batches = function() {
  return this.map(x => [x]);
};

Rx.Observable.prototype.batchScan = function(fn, initial) {
  return this.batches().scan((state, batch) => batch.reduce(fn, state), initial);
};
