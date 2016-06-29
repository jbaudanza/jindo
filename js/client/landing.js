const React = require('react');
const ReactDOM = require('react-dom');
const ChatApp = require('../chat/ChatApp');

const babel = require('babel-core');
const presets = [
  require('babel-preset-react'),
  require('babel-preset-es2015'),
];

const publicKey = `
-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCWp0c1AY/2/vINo9hcst0wemQx
OHit5y35u4k9uzRcqv9xXsCxLOIJxlQY+TR0c5IC5z7VUNS23QAjYeq5VADf/wFO
Rnb+Fej/W0yq2CP7+vKwkIPquWlXEdtnnB1NU/ZJwITb2BKlS4JiuASClbEyanbI
NrAIBtaY6C/iE29TWwIDAQAB
-----END PUBLIC KEY-----
`;


let JSEncrypt;
if (typeof navigator === 'object') {
  JSEncrypt = require('jsencrypt').JSEncrypt;
}


function TabItem(props) {
  let style;
  let className;

  if (props.active) {
    style = {display: 'block', minHeight: '322px'};
    className = 'is-active tab-link';
  } else {
    style = {display: 'none', minHeight: '322px'};
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
  constructor(props) {
    super(props);
    this.run = this.run.bind(this);
    let tab;
    if (props.run) {
      tab = 'output';
    } else {
      tab = 'source';
    }
    this.state = {hasRun: false, running: false, tab: tab};
  }

  run() {
    // Destroy old output if there already was one.
    this.refs.output.innerHTML = '';

    const rawCode = this.editor.getValue();
    const transformed = babel.transform(rawCode, {presets: presets});

    const output = document.createElement('pre');
    output.className = 'output';
    this.refs.output.appendChild(output);

    try {
      eval(transformed.code);
    } catch(e) {
      window.alert(e)
    }

    this.setState({hasRun: true, running: false, tab: 'output'});
  }

  componentDidMount() {
    this.refs.editor.innerHTML = this.props.code;
    this.editor = ace.edit(this.refs.editor);
    this.editor.setTheme("ace/theme/monokai");
    this.editor.getSession().setMode("ace/mode/jsx");
    this.editor.setOptions({
      fontFamily: "Source Code Pro",
      fontSize: '16px'
    });

    if (this.props.run) {
      this.run();
    }
  }

  setTab(tab) {
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
`/* Notice how when you run this snippit, the
    output from the previous snippit
    automatically updates
*/
jindo.publish({message: 'Hello Jindo'})
     .then(r => output.textContent =
            JSON.stringify(r));
`;


const publishAuthJs = 
`/* Notice how this event will get published
    with an "actor" attribute. */
var token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm92aWRlciI6ImdpdGh1YiIsInVzZXJJZCI6MzU5MTQsImlhdCI6MTQ2NjcxNjIyNH0.9ghOBvvax7fx0S9GOUbzlwWcf7mFxaUfWN1C0DaW_0Q";
jindo.publish({message: 'Hello JWT'}, token)
     .then(r => output.textContent =
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
        list => output.textContent =
           list.map(JSON.stringify).join("\\n")
    );
`;

const authJs =
`jindo.authenticate().then(
  token => output.textContent = token
);
`;

const chatJs = 
`ReactDOM.render(
  &lt;ChatApp backend={jindo} /&gt;,
  output
);
`;

function escape(str) {
  return str
    .replace(/\n/g, '')
    .replace(/>\s+</g, '><')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const subscribeHTML = `
<form>
  <b>Interested? Join our mailing list</b>
  <input name="email" placeholder="you@example.com">
  <input name="subscribe" type="submit" value="subscribe">
  <p>
    <i>p.s.: checkout the source for this form</i>
  </p>
</form>`;

const subscribeJs =
`output.innerHTML = '${escape(subscribeHTML)}';
const form = output.getElementsByTagName('form')[0]
form.onsubmit = function(event) {
  event.preventDefault();
  const email = form.email.value;
  if (email) {
    const encrypt = new JSEncrypt();
    encrypt.setPublicKey(publicKey);
    const encrypted = encrypt.encrypt(email);
    jindo.publish({
      type: 'subscribe',
      email: encrypted
    }).then(thankYou)
  }
};
function thankYou() {
  output.innerHTML = "<h1>Thank you! We'll be in touch!</h1>"
}
`

function LandingPage(props) {

  return (
    <div style={{paddingTop: '0.75em'}}>

      <p>
        <b>jindo.io</b> is a minimalist drop-in reactive backend for Javascript
        applications.
      </p>

      <p>
        To use jindo, simply include the script tag in your document.
      </p>


      <p>
        Jindo provides a mechanism to store, synchronize, and replay events
        that happen inside your application. An event is defined as anything
        that affects the current state of your application. For example, if a
        user updates their profile image, enters a message into a chatroom,
        or likes a post, you might want to generate a jindo event.
      </p>

      <p>
        Jindo will create an <a href="https://zenparsing.github.io/es-observable/">ECMAScript Observable</a> object
        called <span className='inline-code'>jindo.events</span> in your Javascript namespace.
        An Observable acts like a promise but continues to deliver new values over time.
      </p>

      <p>
        When a client subscribes to the jindo observable, jindo will replay
        every jindo event that has occured on that website. It will also publish
        new events as they occur. Your application can reduce this event stream
        into its current state.
      </p>

      <p>
        The jindo observable is powered by <a href="https://github.com/Reactive-Extensions/RxJS">RxJs</a>, so
        all of RxJs&#8217;s functions like <span className='inline-code'>map</span>, <span className='inline-code'>reduce</span>, and <span className='inline-code'>scan</span> are available to you.
      </p>

      <CodeSnippit code={reduceJs} />

      <p>
        Events can be pushed onto your jindo observable through the <span className='inline-code'>jindo.publish()</span> function.
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
        This is a preview release. We&#8217;re very excited about some new
        features in our roadmap. For example:
      </p>

      <ul style={{listStyleType: 'circle', paddingLeft: '50px', marginBottom: '0.75em'}}>
        <li>Time traveling</li>
        <li>Private observables</li>
        <li>Server side observables</li>
      </ul>

      <CodeSnippit code={subscribeJs} run={true} />

      <p>
      Want to say hello? Email <a href="mailto:hello@jindo.io">hello@jindo.io</a>.
      </p>

    </div>
  )
}

if (typeof window === 'object') {
  window.main = function(el, backend) {
    ReactDOM.render(<LandingPage backend={backend}/>, el);
  }
}

if (typeof module === 'object') {
  module.exports = LandingPage;
}