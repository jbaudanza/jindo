const React = require('react');
const ReactDOM = require('react-dom');


class ChatApp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {list: [], connected: false};

    this.onSubmit = this.onSubmit.bind(this);
    this.onClickLogin = this.onClickLogin.bind(this);
  }

  componentWillMount() {
    this.props.backend.events
        .scan((list, e) => list.concat(e), [])
        .subscribe((list) => this.setState({list}));

    this.props.backend.connected.subscribe(connected => this.setState({connected}))
  }

  onClickLogin() {
    this.props.backend.authenticate().then(function(token) {
      const identity = jwtDecode(token);
      fetch("http://api.soundcloud.com/users/" + identity.userId  + "?client_id=929237b25472ca25f7977cef36ee6808").then(function(result) {console.log(result)})
      console.log(token);
    });
  }

  onSubmit(event) {
    event.preventDefault();
    const el = event.target.message;
    this.props.backend.publish({message: el.value});
    el.value = '';
  }

  render() {
    return (
      <div>
        Connected: <span>{String(this.state.connected)}</span>

        <ul>
          {this.state.list.map(e => <li key={e.id}>{e.message}</li>)}
        </ul>
        <form onSubmit={this.onSubmit}>
          <input name="message" />
        </form>

        <a href="#" onClick={this.onClickLogin}>
          login
        </a>
      </div>
    );
  }
}

window.main = function(el, backend) {
  ReactDOM.render(<ChatApp backend={backend}/>, el);
}
