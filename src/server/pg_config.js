import url from 'url';

let conString;
let ssl = (process.env['NODE_ENV'] === 'production');

if (process.env['NODE_ENV'] === 'test') {
  conString = "postgres://localhost/jindo_test";
} else if (process.env['DATABASE_URL']) {
  conString = process.env['DATABASE_URL'];
} else {
  conString = "postgres://localhost/observables_development";
}

const params = url.parse(conString);

const config = {
  host: params.hostname,
  database: params.pathname.split('/')[1],
  ssl: ssl
};

if (params.port) {
  config.port = params.port;
}

if (params.auth) {
  const auth = params.auth.split(':');
  config.user = auth[0];
  config.password = auth[1];
}

module.exports = config;
