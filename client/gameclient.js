class ClientConnection {
  constructor() {
    this.ws = null;
    this.roomID = null;
    this.uid = null;
    this.isHost = null;

    this.gamestate = {};
    this.currentChoice = null;

    this.loadedFlag = false;

    this.connect();
    this.readyReload();
    this.deselectInit();
    this.giveUpInit();
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
          this.loadedFlag = false;
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
        case 'opponent_gave_up':
          this.jover('Your opponent just gave up');
        case 'opponent_left':
          this.jover('Your opponent just left');
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

    opp.textContent = "Other player's path: "
    const opponentArray = this.isHost ? this.gamestate.guestArray : this.gamestate.hostArray;
    for (let link of opponentArray) {
      const item = document.createElement('li');
      item.textContent = link.title;
      opp.appendChild(item);
    }

    mySide.appendChild(list);
    myList.appendChild(mypath);
    oppSide.appendChild(opp);

    this.loadedFlag = true;
  }

  readyReload() {
    const ready = document.getElementById('nextMoveButton');
    ready.style.backgroundColor = '#4CAF50';

    const handleClickReady = () => {
      if (!this.loadedFlag) return;
      if (this.currentChoice !== null) {
        ready.style.backgroundColor = '#f56969';
        this.ws.send(JSON.stringify({
          type: 'choice',
          data: {
            choice: this.currentChoice,
            sentfrom: this.isHost ? 'host' : 'guest',
          }
        }));
        ready.removeEventListener('click', handleClickReady);
      } else {
        ready.style.background = '#ffee8c';
        this.ws.send(JSON.stringify({
          type: 'choice',
          data: {
            choice: this.isHost ? this.gamestate.hostArray.pop().title : this.gamestate.guestArray.pop().title,
            sentfrom: this.isHost ? 'host' : 'guest',
          }
        }));
        ready.removeEventListener('click', handleClickReady);
      }

    }
    ready.addEventListener('click', handleClickReady);
  }

  deselectInit() {
    const deselect = document.getElementById('deselect');
    deselect.addEventListener('click', () => {
      if (!this.loadedFlag) return;
      this.ws.send(JSON.stringify({
        type: 'clear_choice',
        data: {sentfrom: this.isHost ? 'host' : 'guest'}
      }));
      this.currentChoice = null;
      current.textContent = null;
      this.readyReload();
    });
  }

  giveUpInit() {
    const giveUp = document.getElementById('giveUp');
    const popup = document.getElementById('areyousure');
    const giveUpYes = document.getElementById('giveUpYes');
    const giveUpNo = document.getElementById('giveUpNo');
    const overlay = document.getElementById('overlay');

    giveUp.addEventListener('click', () => {
      if (!this.loadedFlag) return;
      popup.style.display = 'flex';
      overlay.style.display = 'block';
    });

    giveUpNo.addEventListener('click', () => {
      popup.style.display = 'none';
      overlay.style.display = 'none';
    })

    giveUpYes.addEventListener('click', () => {
      this.ws.send(JSON.stringify({
        type: 'give_up',
        data: {sentfrom: this.isHost ? 'host' : 'guest'}
      }));
      this.backToLobby();
    });
  }

  jover(message) {
    const allPopups = document.getElementsByClassName('popup');
    const jover = document.getElementById('endscreen');
    const joverButton = document.getElementById('redirectMe');
    const joverText = document.getElementById('popuptext');
    const overlay = document.getElementById('overlay');

    for (let popup of allPopups) {
      popup.style.display = 'none';
    }

    jover.style.display = 'flex';
    overlay.style.display = 'block';
    joverText.textContent = message;
    joverButton.addEventListener('click', () => {
      this.backToLobby();
      connection.send(JSON.stringify({
        type: 'clear',
        data: { sentfrom: this.isHost ? 'host' : 'guest' }
      }));
    })
  }

  backToLobby() {
    window.location.href = '/';
    this.connect();
  }

  showVictoryButtons() {
    const winscreen = document.getElementById('win');
    const nextButton = document.getElementById('nextGameYes');
    const nopeButton = document.getElementById('nextGameNo');
    const overlay = document.getElementById('overlay');
    const connection = this.ws;
    //const hostornot = this.isHost ? 'host' : 'guest';

    winscreen.style.display = 'flex';
    overlay.style.display = 'block';
    nextButton.addEventListener('click', () => {
      connection.send(JSON.stringify({
        type: 'another_one',
        data: { sentfrom: this.isHost ? 'host' : 'guest' }
      }));
    });
    nopeButton.addEventListener('click', () => {
      connection.send(JSON.stringify({
        type: 'left_after_win',
        data: { sentfrom: this.isHost ? 'host' : 'guest' }
      }));
      this.backToLobby();
    })
  }

  hideVictoryButtons() {
    const winscreen = document.getElementById('win');
    winscreen.style.display = 'none';
  }
}

let connection;
window.addEventListener('DOMContentLoaded', () => {
  connection = new ClientConnection();
});