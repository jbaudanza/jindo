"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.difference = difference;
exports.union = union;
exports.add = add;
exports.remove = remove;
exports.map = map;
// Convenience functions for doing immutable operations on ES6 sets

function difference(set1, set2) {
  var result = new Set();

  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = set1[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var i = _step.value;

      if (!set2.has(i)) {
        result.add(i);
      }
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  return result;
}

function union(set1, set2) {
  var result = new Set();

  function add(v) {
    result.add(v);
  }

  set1.forEach(add);
  set2.forEach(add);

  return result;
}

function add(set, value) {
  var result = new Set(set);
  result.add(value);
  return result;
}

function remove(set, value) {
  var result = new Set(set);
  result.delete(value);
  return result;
}

function map(set, fn) {
  var result = [];

  set.forEach(function (v) {
    result.push(fn(v));
  });

  return result;
}