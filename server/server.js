const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const uuid = require('uuid').v4;
const { WebSocketServer, WebSocket } = require('ws');

const { Gamestate, createGame } = require('./game.js');

const httppserver = http.createServer((request, response) => {
    if (request.method != 'GET') {
        response.statusCode = 501;
        response.setHeader("Content-Type", "text/plain");
        return response.end("no POSTing here");
    }

    let parsedLink = url.parse(request.url, true);
    let cutParamsLink = parsedLink.path.split('?')[0];
    let trimLink = cutParamsLink.replace(/^\/+|\/+$/g, '');

    if (trimLink == '') {
        trimLink = 'index.html';
    }

    console.log(`${request.socket.remoteAddress} requested file ${trimLink}`);

    const file = path.join(__dirname, '..', 'client', trimLink);
    fs.readFile(file, (error, content) => {
        if (error) {
            console.log(`file ${file} not found`);
            response.writeHead(404);
            response.end();
        } else {
            //console.log(`serving ${file} to ${request.socket.remoteAddress}`);
            response.setHeader("X-Content-Type-Options", "nosniff");
            switch (trimLink) {
                case 'index.html':
                case 'game.html':
                    response.writeHead(200, { "Content-type": "text/html" });
                    break;
                case 'client.js':
                case 'lobby.js':
                    response.writeHead(200, { "Content-type": "application/javascript" });
                    break;
                case 'styles.css':
                    response.writeHead(200, { "Content-type": "text/css" });
                    break;
                case 'W.png':
                    response.writeHead(200, { "Content-Type": "image/png" });
            }
            response.end(content)
        }
    })

});



const wss = new WebSocketServer({ server: httppserver });
const port = process.env.PORT || 9999;
const nOfRooms = 1;

const gameRooms = new Map();

class Gameroom {
    constructor(roomID) {
        this.roomID = roomID;
        this.hostID = null;
        this.guestID = null;
        this.hostConnection = null;
        this.guestConnection = null;
        this.lobby = null;
        this.status = 'pending';
        this.config = {
            lang: null
        }
        this.gamestate = new Gamestate(this.config.lang); 
    }

    broadcast(type, data = {}, toWhom = null) { //
        const message = JSON.stringify({
            type: type,
            data: data
        });

        if (this.hostConnection && toWhom !== 'guest') {
            if (this.hostConnection.readyState === WebSocket.OPEN) {
                this.hostConnection.send(message);
            } else {
                console.log(`host ${this.hostID} of room ${this.roomID} is not open`);
            }
        } else if (toWhom === null) {
            console.log(`no host to receive message ${type}`);
        };

        if (this.guestConnection && toWhom !== 'host') {
            if (this.guestConnection.readyState === WebSocket.OPEN) {
                this.guestConnection.send(message);
            } else {
                console.log(`guest ${this.guestID} of room ${this.roomID} is not open`);
            }
        } else if (toWhom === null) {
            console.log(`no guest to receive message ${type}`);
        };
    }

    isFull() {
        return this.hostID && this.guestID;
    }

    isEmpty() {
        return !this.hostID && !this.guestID;
    }
}

function createRooms(n = nOfRooms) {
    for (let i = 0; i < n; i++) {
        let roomID = uuid().slice(0, 8);
        let room = new Gameroom(roomID);
        gameRooms.set(roomID, room);
    }
    console.log(`created ${nOfRooms} rooms`);
}

function findEmptyRoomID() {
    const cpRooms = Array.from(gameRooms);
    let i = 0;
    while (i < nOfRooms) {
        if (cpRooms[0][1].isEmpty()) {
            return cpRooms[0][0];
        } else {
            cpRooms.shift();
            i++;
        }
    }
    console.log('no empty rooms you do not get to play get fucked');
    return false;
}

async function handleGameStart(room) {
    try {
        await room.gamestate.init();
        room.broadcast('game_initialized');
    } catch (error) {
        console.error('Failed to initialize game:', error);
    }
}

function findRoomByUID(uid) {
    const copy = Array.from(gameRooms).map(arr => arr[1]);
    for (room of copy) {
        if (uid === room.hostID || uid === room.guestID) return room;
    }
    console.log(`there is not a room with uid ${uid}`);
}

wss.on('connection', (connection, request) => {
    const uid = uuid().slice(0, 8);
    const urlinstance = request.url;
    const type = url.parse(urlinstance, true).query.type;

    const roomID = findEmptyRoomID();
    const room = gameRooms.get(roomID); 

    if (!room) {
        connection.close(1008, 'wrong room code');
        console.log(`there is no room with id ${roomID}, GET OUT!`);
        return;
    }

    link = `http://localhost:9999/game.html?type=guest&roomID=${roomID}`;

    switch (type) {
        case 'lobby':
            console.log(`user has entered the lobby`);
            room.lobby = connection;
            break;
        case 'host':
            console.log(`host ${uid} has joined room ${roomID}`);
            room.hostID = uid; 
            room.hostConnection = connection; 
            break;
        case 'guest':
            console.log(`guest has joined room ${roomID}`);
            room.guestID = uid; 
            room.guestConnection = connection;

            room.lobby.send(JSON.stringify({type: 'game_starts', data: {}}));
            
            break;
        default:
            console.log('no type provided');
            break;
    }

    connection.on('message', (message) => {
        message = JSON.parse(message.toString());
        console.log(`received message ${message.type}`);

        switch (message.type) {
            case 'printrooms':
                console.log(gameRooms);
                break;

            case '':

                break;
            case 'next_move':
                const article = message.data.name;
                room.gamestate.getNext(true, article)
                    .then(() => console.log(`next article for host fetched succesfully`));
                break;
            case 'generate_link':
                room.config = {
                    ...room.config,
                    ...message.data
                }
                connection.send(JSON.stringify({type: 'gamelink', data: link}));
                break;
            default:
                console.log(`Unknown message, type: ${message.type}`);
        }
    });

    connection.on('close', () => {
        /*if (room.status === 'pending') {
            console.log('host left before starting the game');
            gameRooms.delete(roomID);
            createRooms(1);
            return;
        }
        if (room.hostConnection.readyState === WebSocket.CLOSED &&
            room.guestConnection.readyState === WebSocket.CLOSED) {
            console.log(`room ${roomID} is empty, cleaning up`);
            gameRooms.delete(roomID);
            createRooms(1);
        } else {
            console.log(`user ${uid} disconnected from room: ${roomID}, reconnect via:`);
            console.log(`ws://localhost:${port}?first=${uid === room.hostID}&roomID=${roomID}`);
        }*/
    })

    connection.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
})

httppserver.listen(port, () => {
    createRooms();
    console.log(`server running on port ${port}`);
});