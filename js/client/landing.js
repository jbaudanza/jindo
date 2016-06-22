const React = require('react');
const ReactDOM = require('react-dom');
const ChatApp = require('../chat/ChatApp');


function TabItem(props) {
  let style;
  let className;

  if (props.active) {
    style = {display: 'block'};
    className = 'is-active tab-link';
  } else {
    style = {display: 'none'};
    className = 'tab-link'
  }

  function onClick(event) {
    event.preventDefault();
    props.onActivate();
  }

  return (
    <li className="tab-header-and-content">
      <a href="#" onClick={onClick} className={className}>{props.title}</a>
      <div className="tab-content" style={style}>
        {props.children}
      </div>
    </li>
  );
}


class CodeSnippit extends React.Component {
  constructor() {
    super();
    this.run = this.run.bind(this);
    this.state = {hasRun: false, running: false, tab: 'source'};
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

      this.setState({hasRun: true, running: false, tab: 'output'});
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

  setTab(tab) {
    console.log(tab)
    this.setState({tab});
  }

  render() {
    const style = {
      width: '100%',
      height: '220px',
      marginBottom: '0.75em'
    };

    function propsForTab(tab) {
      return {
        active: this.state.tab === 'source',
        onActivate: this.setTab.bind(this, 'source')
      };
    }

    return (
      <div className='code-snippit'>
        <ul className="accordion-tabs">
          <TabItem title="Source" active={this.state.tab === 'source'} onActivate={this.setTab.bind(this, 'source')}>
            <div ref="editor" style={style} />
            <button onClick={this.run} disabled={this.state.running}>
              {this.state.hasRun ? 'Re-Run' : 'Run'}
            </button>
          </TabItem>
          <TabItem title="Output" active={this.state.tab === 'output'} onActivate={this.setTab.bind(this, 'output')}>
            <div ref="output" />
          </TabItem>
        </ul>
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
    );
`;

const authJs =
`jindo.authenticate().then(
  token => output.innerText = token
);
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
        To use jindo in your Javascript app, include the jindo script tag in
        your document.
      </p>

      <code>
        &lt;script src="https://jindo.io/client.js"&gt;&lt;/script&gt;
      </code>

      <p>
        This script tag will create an <a href="https://zenparsing.github.io/es-observable/">ECMAScript Observable</a> object 
        called <b>jindo.events</b> in your document. An Observable is an
        abstraction that works sort of like a promise, except it keeps delivering
        new values over time.
      </p>

      <p>
        When a client subscribes the the jindo observable, it will receive
        notifications whenever a new event is published to the jindo API.
        All clients that running on the same origin domain will by synchronized
        to the same jindo observable.
      </p>

      <p>
      Subscribing to the jindo observable to replay all the events that have
      ever happened on that observable. This allows you to reduce the event
      steam into the current state of your reactive application.
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

      <ul style={{listStyleType: 'circle', paddingLeft: '50px'}}>
        <li>Time traveling</li>
        <li>Private observables</li>
        <li>Server side observables</li>
      </ul>

      <p>
        Leave your email to get updates.
      </p>

      <form>
        <input name="email" />
        <input type="submit" />
      </form>
    </div>
  )
}

window.main = function(el, backend) {
  ReactDOM.render(<Doc backend={backend}/>, el);
}
