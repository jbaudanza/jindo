require("babel-register")({
  presets: ["react", 'es2015']
});

const fs = require('fs');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const LandingPage = require('./client/landing')

const needle = '<!-- react-content -->';
const template = fs.readFileSync('./public/index_template.html', {encoding: 'utf8'});
const content = ReactDOMServer.renderToString(React.createElement(LandingPage, {}));

fs.writeFileSync('./public/index.html', template.replace(needle, content));
console.log("Written ./public/index.html")
