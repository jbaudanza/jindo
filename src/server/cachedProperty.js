import Rx from 'rxjs';

import * as database from './database';
import {debounce} from 'lodash';


Rx.Observable.prototype.cachedProperty = function(key, accumulator, initialValue) {
  const outer = this;

  return Rx.Observable.create(function(observer) {
    let currentValue;
    let currentVersion;
    let innerSub;

    const debouncedUpdate = debounce(database.storeProperty, 100);

    database.fetchProperty(key).then(function(result) {
      if (typeof result === 'undefined') {
        return {value: initialValue, version: 0};
      } else {
        return result;
      }
    }).then(function(result) {
      currentValue = result.value;
      currentVersion = result.version;

      if (typeof currentValue !== 'undefined') {
        observer.next(currentValue);
      }

      innerSub = outer.skip(result.version).subscribe(function(nextValue) {
        currentValue = accumulator(currentValue, nextValue, currentVersion);

        currentVersion++;
        debouncedUpdate(key, currentValue, currentVersion);

        observer.next(currentValue);
      });

    }, observer.error.bind(observer));

    return function() {
      if (innerSub)
        innerSub.unsubscribe();
    }
  });
};