class ClientConnection {
  constructor() {
    this.ws = null;
    this.roomID = null;
    this.playerID = null;
    this.opponentID = null;
    this.isHost = 'ww';
    this.status = 'created';
    this.gamestate = {};

    this.connect();
  }

  connect() {
    console.log('trigger')
    const connectionurl = window.location.href; 
    console.log(connectionurl);
    const params = new Map(connectionurl.split('?')[1].split('&').map(string => string.split('=')));
    console.log(params)
    this.isHost = params.get('type') === 'host'; 
    this.roomID = params.get('roomID');
    
    this.ws = new WebSocket(connectionurl);
    

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Got message:', message.type);

      switch (message.type) {
       
        case 'host_joined_room':
    
          break;
        case 'guest_joined_room':
          
          break;
        case 'share_gamestate':
          
          break;
        default:
          console.log(`Unknown message, type: ${message.type}`);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }
}

let connection;
window.addEventListener('DOMContentLoaded', () => {
  console.log('loaded');
  connection = new ClientConnection();
  console.log(connection)
});