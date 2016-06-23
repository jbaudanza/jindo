const React = require('react');

const distanceOfTimeInWords = require('./distanceOfTimeInWords');

function fetchProfile(identity) {
  if (!identity.provider || !identity.userId)
    return;

  switch(identity.provider) {
    case 'soundcloud':
      return fetch("http://api.soundcloud.com/users/" + identity.userId  + "?client_id=929237b25472ca25f7977cef36ee6808")
        .then(r => r.json())
        .then(
          (profile) => ({
            avatarUrl: profile['avatar_url'],
            profileUrl: profile['permalink_url'],
            name: profile['full_name']
          })
        )
    case 'github':
      return fetch(`https://api.github.com/user/${identity.userId}`)
        .then(r => r.json())
        .then(
          (profile) => ({
            avatarUrl: profile['avatar_url'],
            profileUrl: profile['html_url'],
            name: profile['name']
          })
        )
  }
}


function fetchProfileWithCache(identity, cache) {
  const key = identityKey(identity);
  if (!cache.hasOwnProperty(key)) {
    cache[key] = fetchProfile(identity);
  }
  return cache[key];
}

function identityKey(identity) {
  if (identity) {
    return identity.provider + "-" + identity.userId;
  }
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

    const key = identityKey(this.props.actor);
    let avatarUrl;
    let name;
    let profileUrl;
    if (key in this.props.users) {
      avatarUrl = this.props.users[key].avatarUrl;
      profileUrl = this.props.users[key].profileUrl;
      name = this.props.users[key].name;
    }

    return (
      <li style={styles.row}>
        <img className="avatar" style={styles.avatar} src={avatarUrl} />
        <div style={{flex: 1}}>
          <div className="header">
            <b><a href={profileUrl}>{name}</a></b>
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


function unique(arr, transform) {
  const u = {}, a = [];
  if (!transform)
    transform = ((x) => x)

  for(let i = 0, l = arr.length; i < l; ++i) {
      const v = transform(arr[i]);
      if(!u.hasOwnProperty(v)) {
          a.push(arr[i]);
          u[v] = 1;
      }
  }

  return a;
}


function uniqueActors(events) {
  return unique(
    events
      .filter(e => e.actor && e.actor.userId && e.actor.provider)
      .map(e => e.actor),
    identityKey
  )
}


class ChatApp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {list: [], connected: false, message: '', users: {}};

    this.onSubmit = this.onSubmit.bind(this);
    this.onClickLogin = this.onClickLogin.bind(this);
    this.onChange = this.onChange.bind(this);
  }

  componentWillMount() {
    const messages = this.props.backend.events
        .scan((list, e) => list.concat(e), [])
        .map(list => list.slice(-10))

    const profileCache = {};

    messages
      .map(uniqueActors)
      .subscribe((list) => {
        list.forEach((function(identity) {
          fetchProfileWithCache(identity, profileCache).then((function(profile) {
            this.state.users[identityKey(identity)] = profile;
            this.setState({users: this.state.users})
          }).bind(this));
        }).bind(this));
      });

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
                {this.state.list.map(e => <ChatMessage key={e.id} users={this.state.users} now={this.state.now} {...e} />)}
              </ul>
              {
                this.state.profile ? (
                  <div style={styles.compose.wrapper}>
                    <img className='avatar' src={this.state.profile.avatarUrl} style={styles.avatar} />
                    <form style={styles.compose.form} onSubmit={this.onSubmit}>
                      <input style={styles.compose.input} type="text" onChange={this.onChange} value={this.state.message} />
                      <input style={styles.compose.sendButton} type="submit" value="send" disabled={!this.state.message.trim()} />
                    </form>
                  </div>
                ) : (
                  <div style={{textAlign: 'center', paddingTop: '5px'}}>
                    <a href="#" onClick={this.onClickLogin} className='login-button'>
                      login with GitHub
                    </a>
                  </div>
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
