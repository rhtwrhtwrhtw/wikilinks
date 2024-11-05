class ClientConnection {
  constructor() {
    this.ws = null;
    this.roomID = null;
    this.playerID = null;
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
    this.ws = new WebSocket(`ws://localhost:9999?first=true&roomID=`);
    this.status = 'connected';

    const params = new URLSearchParams(window.location.params);
    this.isHost = params.get('first') === 'true';

    if (this.isHost) {
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({
          type: 'host_connection',
          data: 'host is connected'
        }));
      };


    } else {

    }

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
      }
    };
  }
}



const button = document.getElementById('linkbutton');

button.addEventListener('click', () => {
  clientgameroom.ws.send(JSON.stringify({
    type: 'generate_link',
    data: {} // here I can pass the config file 
  }), 'host');
})

let clientgameroom;
window.addEventListener('DOMContentLoaded', () => {
  clientgameroom = new ClientConnection();
});