class ClientConnection {
  constructor() {
    this.ws = null;
    this.roomID = null;
    this.playerID = null;
    this.isHost = null;
    this.status = 'created';
    this.gamestate = {};

    this.connect();
  }

  connect() {
    const connectionurl = window.location.href;
    const params = new Map(connectionurl.split('?')[1].split('&').map(string => string.split('=')));
    this.isHost = params.get('type') === 'host';
    this.roomID = params.get('roomID');
    this.uid = params.get('uid');

    this.ws = new WebSocket(connectionurl);

    this.ws.onopen = (event) => {
      if (!this.isHost) {
        this.ws.send(JSON.stringify({
          type: 'host_transfer',
          data: {}
        }));
      };
    }

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Got message:', message.type);

      switch (message.type) {

        case 'initial_gamestate':
          this.gamestate = message.data;
          this.displayState();
          break;
        case 'set_uid':
          this.playerID = message.data;
          break;
        
        case 'restore_gamestate':
          this.gamestate = message.data;
          this.displayState();
          break;
        default:
          console.log(`Unknown message, type: ${message.type}`);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }


  displayState() {
    console.log('displaying');
    const gamediv = document.getElementById('game');
    gamediv.innerHTML = '';

    const your = document.createElement('p');
    const list = document.createElement('ul');
    const opp = document.createElement('ol');

    your.textContent = 'Your article is: ' +
      (this.isHost ? this.gamestate.hostLink.title : this.gamestate.guestLink.title);

    list.textContent = 'You can choose from: '
    const yourArray = this.isHost ? this.gamestate.hostLink.links : this.gamestate.guestLink.links;
    for (let link of yourArray) {
      const item = document.createElement('li');
      item.textContent = link.title;
      list.appendChild(item);
    }

    opp.textContent = "Your opponent's path: "
    const opponentArray = this.isHost ? this.gamestate.guestArray : this.gamestate.hostArray;
    for (let link of opponentArray) {
      const item = document.createElement('li');
      item.textContent = link.title;
      opp.appendChild(item);
    }


    gamediv.appendChild(your);
    gamediv.appendChild(list);
    gamediv.appendChild(opp);
  }
};


let connection;
window.addEventListener('DOMContentLoaded', () => {
  console.log('loaded');
  connection = new ClientConnection();
  setTimeout(() => console.log(connection), 10000);
});