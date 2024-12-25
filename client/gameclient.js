class ClientConnection {
  constructor() {
    this.ws = null;
    this.roomID = null;
    this.uid = null;
    this.isHost = null;

    this.gamestate = {};
    this.currentChoice = null;

    this.connect();
    this.buttonReload();
  }

  connect() {
    const connectionurl = window.location.href;
    const params = new Map(connectionurl.split('?')[1].split('&').map(string => string.split('=')));
    this.isHost = params.get('type') === 'host';
    this.roomID = params.get('roomID');
    this.uid = params.get('uid');

    this.ws = new WebSocket(connectionurl.replace('wss://', 'ws://'));

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
          this.buttonReload();
          break;
        case 'victory':
          alert('You have met on the same article! You won!');
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
    const current = document.getElementById('current');
    const mySide = document.getElementById('mySide');
    const myList = document.getElementById('myList');
    const oppSide = document.getElementById('oppSide');
    mySide.innerHTML = '';
    myList.innerHTML = '';
    oppSide.innerHTML = '';

    const your = document.createElement('p');
    const list = document.createElement('ul');
    const mypath = document.createElement('ol');
    const opp = document.createElement('ol');

    your.textContent = 'Your article is: ' +
      (this.isHost ? this.gamestate.hostLink.title : this.gamestate.guestLink.title);

    list.textContent = 'You can choose from: '
    const yourArray = this.isHost ? this.gamestate.hostLink.links : this.gamestate.guestLink.links;
    for (let link of yourArray) {
      const item = document.createElement('li');
      item.textContent = link;
      item.addEventListener('click', () => {
        current.textContent = item.textContent;
        this.currentChoice = item.textContent;
      });
      list.appendChild(item);
    }

    mypath.textContent = "Your path: "
    const myArray = this.isHost ? this.gamestate.hostArray : this.gamestate.guestArray;
    for (let link of myArray) {
      const item = document.createElement('li');
      item.textContent = link.title;
      mypath.appendChild(item);
    }

    opp.textContent = "Your opponent's path: "
    const opponentArray = this.isHost ? this.gamestate.guestArray : this.gamestate.hostArray;
    for (let link of opponentArray) {
      const item = document.createElement('li');
      item.textContent = link.title;
      opp.appendChild(item);
    }


    mySide.appendChild(your);
    mySide.appendChild(list);
    myList.appendChild(mypath); 
    oppSide.appendChild(opp);
  }

  buttonReload() {
    const ready = document.getElementById('nextMoveButton');
    ready.style.backgroundColor = '#4CAF50';

    const handleClick = (event) => {
      if (this.currentChoice !== null) {
        ready.style.backgroundColor = '#f56969';
        this.ws.send(JSON.stringify({
          type: this.isHost ? 'host_choice' : 'guest_choice',
          data: this.currentChoice
        }));
        ready.removeEventListener('click', handleClick);
      } else {
        event.preventDefault();
      }
    }

    ready.addEventListener('click', handleClick);
  }
}

let connection;
window.addEventListener('DOMContentLoaded', () => {
  console.log('loaded');
  connection = new ClientConnection();
  setTimeout(() => console.log(connection), 10000);
});