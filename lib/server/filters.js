'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.toSQL = toSQL;
function toSQL(filters) {
  var conditions = [];
  var values = [];

  Object.keys(filters).forEach(function (key) {
    var value = filters[key];
    var operator = '=';

    if ((typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object') {
      var keys = Object.keys(value);
      if (keys.length === 1) {
        switch (keys[0]) {
          case '$gt':
            value = value[keys[0]];
            operator = '>';
            break;
          case '$lt':
            value = value[keys[0]];
            operator = '<';
            break;
          case '$eq':
            value = value[keys[0]];
            operator = '=';
            break;
        }
      }
    }

    var placeholder = void 0;
    if (Array.isArray(value)) {
      operator = '= ANY';
      placeholder = '($' + (conditions.length + 1) + ')';
    } else {
      placeholder = '$' + (conditions.length + 1);
    }

    conditions.push(key + ' ' + operator + ' ' + placeholder);
    values.push(value);
  });

  return [conditions.join(' AND '), values];
}