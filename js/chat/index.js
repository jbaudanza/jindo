require('whatwg-fetch');

const React = require('react');
const ReactDOM = require('react-dom');
const ChatApp = require('./ChatApp');

window.main = function(el, backend) {
  backend.presence({
    type: 'join'
  }, {
    type: 'part'
  })
  ReactDOM.render(<ChatApp backend={backend} />, el);
}
