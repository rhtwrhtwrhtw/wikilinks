class ClientConnection {
  constructor() {
    this.ws = null;
    this.roomID = null;
    this.uid = null;
    this.isHost = null;

    this.gamestate = {};
    this.currentChoice = null;

    this.connect();
    this.readyReload();
    this.deselectInit();
    this.givupInit();
  }

  connect() {
    let connectionurl = window.location.href;
    connectionurl = connectionurl.split('#')[0];
    const params = new Map(connectionurl.split('?')[1].split('&').map(string => string.split('=')));
    this.isHost = params.get('type') === 'host';
    this.roomID = params.get('roomID');
    this.uid = params.get('uid');

    this.ws = new WebSocket(connectionurl);

    this.ws.onopen = () => {
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
          this.readyReload();
          break;
        case 'victory':
          this.showVictoryButtons();
          break;
        case 'clear_button':
          this.hideVictoryButtons();
          this.readyReload();
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
    current.textContent = '';

    const list = document.createElement('div');
    const mypath = document.createElement('ol');
    const opp = document.createElement('ol');

    const yourArticle = this.isHost ? this.gamestate.hostLink.links : this.gamestate.guestLink.links;
    console.log(this.gamestate.guestLink.links)
    list.innerHTML = yourArticle;
    const linksInside = list.getElementsByClassName('gamelink');
    for (let link of linksInside) {
      link.addEventListener('click', () => {
        link.style.color = "#0B0BFF"
        current.textContent = link.getAttribute('linkto').replace(/_/g, ' ');
        this.currentChoice = link.getAttribute('linkto');
      })
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

    mySide.appendChild(list);
    myList.appendChild(mypath);
    oppSide.appendChild(opp);
  }

  readyReload() {
    const ready = document.getElementById('nextMoveButton');
    ready.style.backgroundColor = '#4CAF50';

    const handleClickReady = () => {
      if (this.currentChoice !== null) {
      ready.style.backgroundColor = '#f56969';
      this.ws.send(JSON.stringify({
        type: this.isHost ? 'host_choice' : 'guest_choice',
        data: this.currentChoice
      }));
      ready.removeEventListener('click', handleClickReady);
    } else {
      ready.style.background = '#FDFD96';
      this.ws.send(JSON.stringify({
        type: this.isHost ? 'host_choice' : 'guest_choice',
        data: this.isHost ? this.gamestate.hostArray.pop().title : this.gamestate.guestArray.pop().title
      }));
      ready.removeEventListener('click', handleClickReady);
    }

    }
    ready.addEventListener('click', handleClickReady);
  }

  deselectInit() {
    const deselect = document.getElementById('deselect');
    deselect.addEventListener('click', () => {
      this.ws.send(JSON.stringify({
        type: this.isHost ? 'host_clear_choice' : 'guest_clear_choice',
        data: {}
      }));
      this.currentChoice = null;
      current.textContent = null;
      this.readyReload();
    });
  }

  givupInit() {
    const giveUp = document.getElementById('giveUp');
    giveUp.addEventListener('click', () => {
      this.ws.send(JSON.stringify({
        type: this.isHost ? 'host_concede' : 'guest_concede',
        data: {}
      }));
    })
  }

  showVictoryButtons() {
    const overlay = document.getElementById('popups');
    overlay.style.display = 'flex';

    const nextButton = document.getElementById('nextGameYes');
    const connection = this.ws;
    
    function anotherRound() {
      connection.send(JSON.stringify({
        type: 'another_one',
        data: { sentfrom: this.isHost ? 'host' : 'guest'}
      }));
    }

    nextButton.addEventListener('click', anotherRound);
  }

  hideVictoryButtons() {
    const overlay = document.getElementById('popups');
    overlay.style.display = 'none';
  }
}

let connection;
window.addEventListener('DOMContentLoaded', () => {
  connection = new ClientConnection();
});