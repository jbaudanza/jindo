const React = require('react');

const distanceOfTimeInWords = require('./distanceOfTimeInWords');

function fetchProfile(identity) {
  return fetch("http://api.soundcloud.com/users/" + identity.userId  + "?client_id=929237b25472ca25f7977cef36ee6808").then(r => r.json());
}


class ChatMessage extends React.Component {
  render() {
    const styles = {
      row: {
        display: 'flex',
        padding: 0,
        margin: 0,
        borderBottom: '1px solid #ccc',
        marginTop: 5,
        paddingBottom: 5,
        listStyleType: 'none'
      },
      avatar: {
        width: 35,
        height: 35,
        marginRight: 5
      },
      timestamp: {
        color: '#ccc',
        float: 'right'
      }
    };

    return (
      <li style={styles.row}>
        <img className="avatar" style={styles.avatar} src="https://i1.sndcdn.com/avatars-000000172116-6885ee-large.jpg" />
        <div style={{flex: 1}}>
          <div className="header">
            <b><a href="#">Jon Baudanza</a></b>
            <span className="timestamp" style={styles.timestamp}>
              {distanceOfTimeInWords(this.props.now - new Date(this.props.timestamp))}
            </span>
          </div>
          <div className="body">
            {this.props.message}
          </div>
        </div>
      </li>
    );
  }
}


class ChatApp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {list: [], connected: false, message: ''};

    this.onSubmit = this.onSubmit.bind(this);
    this.onClickLogin = this.onClickLogin.bind(this);
    this.onChange = this.onChange.bind(this);
  }

  componentWillMount() {
    const messages = this.props.backend.events
        .scan((list, e) => list.concat(e), [])
        .map(list => list.slice(-10))

    messages.subscribe((list) => this.setState({list}));

    this.props.backend.connected.subscribe(connected => this.setState({connected}))

    this.tick();

    this.timerId = setInterval(this.tick.bind(this), 30000);
  }

  componentWillUnmount() {
    clearInterval(this.timerId);
    delete this.timerId;
  }

  tick() {
    this.setState({now: new Date()});
  }

  onClickLogin(event) {
    event.preventDefault();
    const tokenPromise = this.props.backend.authenticate();

    tokenPromise.then(token => this.setState({token}));

    tokenPromise
        .then(jwtDecode)
        .then(fetchProfile)
        .then(profile => this.setState({profile}));
  }

  onSubmit(event) {
    event.preventDefault();
    this.props.backend.publish({message: this.state.message}, this.state.token);
    this.setState({message: ''});
  }

  onChange(event) {
    this.setState({message: event.target.value});
  }

  render() {
    const styles = {
      list: {
        padding: 0,
        margin: 0
      },
      avatar: {
        height: 40,
        width: 40
      },
      compose: {
        wrapper: {
          display: 'flex',
          marginTop: '5px'
        },
        input: {
          display: 'block',
          width: '100%',
          boxSizing: 'border-box'
        },
        sendButton: {
          'float': 'right'
        },
        form: {
          flex: '1',
          marginLeft: '5px'
        }
      }
    };

    return (
      <div className='chat-room'>
        {
          this.state.connected ? (
            <div>
              <ul style={styles.list}>
                {this.state.list.map(e => <ChatMessage key={e.id} now={this.state.now} {...e} />)}
              </ul>
              {
                this.state.profile ? (
                  <div style={styles.compose.wrapper}>
                    <img className='avatar' src={this.state.profile.avatar_url} style={styles.avatar} />
                    <form style={styles.compose.form} onSubmit={this.onSubmit}>
                      <input style={styles.compose.input} type="text" onChange={this.onChange} value={this.state.message} />
                      <input style={styles.compose.sendButton} type="submit" value="send" disabled={!this.state.message.trim()} />
                    </form>
                  </div>
                ) : (
                  <a href="#" onClick={this.onClickLogin}>
                    login
                  </a>
                )
              }
            </div>
          ) : (
            <div>disconnected</div>
          )
        }
      </div>
    );
  }
}

module.exports = ChatApp;
