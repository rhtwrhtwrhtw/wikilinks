class ClientConnection {
  constructor() {
    this.ws = null;
    this.roomID = null;
    this.playerID = null;
    this.opponentID = null;
    this.isHost = false;
    this.status = 'created';
    this.gamestate = {
      lang: null,
      hostLink: null,
      guestLink: null,
      hostArray: [],
      guestArray: [],
      isReady: false
    };

    this.connect();
  }

  connect() {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('first')) params.set('first', 'true');
    if (!params.get('roomID')) params.set('roomID', '');
    window.history.replaceState({}, '', `${new URL(window.location.href).pathname}?${params.toString()}`);

    const isHost = params.get('first') === 'true';
    const roomID = params.get('roomID');

    this.ws = new WebSocket(`http://localhost:9999?first=${isHost}&roomID=${roomID}`);

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Got message:', message);

      switch (message.type) {
        case 'gamelink':
          const linkstring = document.createElement('p');
          linkstring.textContent = message.data.link;

          const copybutton = document.createElement('button');
          copybutton.type = "button";
          copybutton.textContent = "Copy";
          copybutton.onclick = () => {
            navigator.clipboard.writeText(message.data.link);
          }

          document.querySelector('.getlink').appendChild(linkstring);
          document.querySelector('.getlink').appendChild(copybutton);
          break;
        case 'host_joined_room':
          this.roomID = message.data.roomID;
          this.playerID = message.data.hostID;
          break;
        case 'guest_joined_room':
          this.opponentID = message.data.guestID;
          break;
        default:
          console.log(`Unknown message, type: ${message.type}`);
      }
    };
  }
}

const list = document.getElementById('lang');
const button = document.getElementById('linkbutton');

button.addEventListener('click', function passLinkOnce() {
  clientgameroom.ws.send(JSON.stringify({
    type: 'generate_link',
    data: {lang: list.value} 
  }), 'host');
 // button.removeEventListener('click', passLinkOnce);
});

let clientgameroom;
window.addEventListener('DOMContentLoaded', () => {
  clientgameroom = new ClientConnection();
  setTimeout(() => console.log(clientgameroom), 2000);
});