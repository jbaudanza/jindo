const React = require('react');
const ReactDOM = require('react-dom');
const ChatApp = require('../chat/ChatApp');

class CodeSnippit extends React.Component {
  constructor() {
    super();
    this.run = this.run.bind(this);
    this.state = {hasRun: false, running: false};
  }

  run() {
    // Destroy old output if there already was one.
    this.refs.output.innerHTML = '';

    const code = this.editor.getValue();
    this.setState({running: true});

    setTimeout((function() {
      this.refs.output.innerHTML = '';
      const output = document.createElement('pre');
      output.className = 'output';
      this.refs.output.appendChild(output);

      try {
        eval(code);
      } catch(e) {
        window.alert(e)
      }

      this.setState({hasRun: true, running: false});
    }).bind(this), 500);
  }

  componentDidMount() {
    this.refs.editor.innerHTML = this.props.code;
    this.editor = ace.edit(this.refs.editor);
    this.editor.setTheme("ace/theme/monokai");
    this.editor.getSession().setMode("ace/mode/javascript");
    this.editor.setOptions({
      fontFamily: "Source Code Pro",
      fontSize: '16px'
    });
  }

  render() {
    const style = {
      width: '100%',
      height: '200px'
    };

    return (
      <div className='code-snippit'>
        <div style={style} ref='editor'></div>
        <button onClick={this.run} disabled={this.state.running}>
          {this.state.hasRun ? 'Re-Run' : 'Run'}
        </button>
        <div ref='output'></div>
      </div>
    )
  }
}

const publishJs = 
`/* Notice how when you run this snippit, the output
from the previous snippit automatically updates
*/
jindo.publish({message: 'Hello Jindo'})
       .then(r => output.innerText = 
            JSON.stringify(r));
`;


const publishAuthJs = 
`/* Notice how this event will get published with
    an "actor" attribute. */
var token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm92aWRlciI6InNvdW5kY2xvdWQiLCJ1c2VySWQiOjE3Mzg0LCJpYXQiOjE0NjY1NDU4MTV9.VGghq5eCqPyI95yTkqWvUrYtYkHWboYG7FsoC3RDMQQ"
jindo.publish({message: 'Hello JWT'}, token)
       .then(r => output.innerText = 
            JSON.stringify(r));
`;


const reduceJs = 
`/* For example, this code will reduce the
    jindo observable on this domain into a
    dynamically updated list of JSON objects */
jindo.events
    .scan((list, e) => list.concat(e), [])
    .map(list => list.slice(-10))
    .subscribe( 
        list => output.innerText =
           list.map(JSON.stringify).join("\\n")
    )`;

const authJs =
`jindo.authenticate().then(
  token => output.innerText = token
)
`;

const chatJs = 
`ReactDOM.render(
  React.createElement(ChatApp, {backend: jindo}),
  output
);
`;

function Doc(props) {

  return (
    <div style={{paddingTop: '0.75em'}}>

      <p>
        <b>jindo.io</b> is the world&#8217;s simplest cloud-hosted reactive
        backend for Javascript apps.
      </p>

      <p>
        To use jindo in your Javascript app, all you need to do is include
        the jindo script tag in your document.
      </p>

      <code>
        &lt;script src="https://jindo.io/client.js"&gt;&lt;script&gt;
      </code>

      <p>
        This script tag will create an <a href="https://zenparsing.github.io/es-observable/">ECMAScript Observable</a> object 
        called <b>jindo.events</b> in your document. An Observable is kind of
        like a Promise that keeps delivering new values. The jindo observable is
        shared between any client that is running on the same origin domain.
      </p>

      <CodeSnippit code={reduceJs} />

      <p>
        Events can be pushed onto your jindo observable through the <b>jindo.publish()</b> function.
        All clients will observe the new event simultanously.
      </p>

      <CodeSnippit code={publishJs} />

      <p>
        You can also include <a href="https://jwt.io/">JSON Web Token</a> along 
        with an event in order to associate a user or identity.
      </p>

      <CodeSnippit code={publishAuthJs} />

      <p>
        You can obtain a JWT tokens by calling <b>jindo.authenticate()</b>, 
        which will use jindo&#8217;s built in OAuth2 integration. In the future,
        jindo will allow you to sign our own JWT tokens.
      </p>

      <CodeSnippit code={authJs} />

      <p>
      You can reduce your jindo observable into something more fun, like a
      chat room!
      </p>

      <CodeSnippit code={chatJs} />

      <p>
      There are no accounts to setup or API keys to setup with jindo. All the
      data that is stored in jindo is tied to the origin of the document that
      included jindo.
      </p>

      <p>
        This is a preview release. There are many more exciting features coming
        soon. For example:
      </p>

      <p>
      <ul style={{listStyleType: 'circle', paddingLeft: '50px'}}>
        <li>Time traveling</li>
        <li>Private observables</li>
        <li>Server side observables</li>
      </ul>
      </p>

      <p>
        Leave your email to get updates.
        <form>
          <input name="email" />
          <input type="submit" />
        </form>
      </p>
    </div>
  )
}

window.main = function(el, backend) {
  ReactDOM.render(<Doc backend={backend}/>, el);
}
