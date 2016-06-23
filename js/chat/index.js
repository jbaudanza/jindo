require('whatwg-fetch');

const React = require('react');
const ReactDOM = require('react-dom');
const ChatApp = require('./ChatApp');

window.main = function(el, backend) {
  ReactDOM.render(<ChatApp backend={backend} />, el);
}

