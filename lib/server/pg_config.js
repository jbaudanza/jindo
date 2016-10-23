'use strict';

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var conString = void 0;
var ssl = process.env['NODE_ENV'] === 'production';

if (process.env['NODE_ENV'] === 'test') {
  conString = "postgres://localhost/jindo_test";
} else if (process.env['DATABASE_URL']) {
  conString = process.env['DATABASE_URL'];
} else {
  conString = "postgres://localhost/observables_development";
}

var params = _url2.default.parse(conString);

var config = {
  host: params.hostname,
  database: params.pathname.split('/')[1],
  ssl: ssl
};

if (params.port) {
  config.port = params.port;
}

if (params.auth) {
  var auth = params.auth.split(':');
  config.user = auth[0];
  config.password = auth[1];
}

module.exports = config;