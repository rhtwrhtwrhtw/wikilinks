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
                    response.writeHead(200, { "Content-type": "text/html" });
                    break;
                case 'game.html':
                    response.writeHead(200, { "Content-type": "text/html" });
                    break;
                case 'styles.css':
                    response.writeHead(200, { "Content-type": "text/css" });
                    break;
                case 'client.js':
                    response.writeHead(200, { "Content-type": "application/javascript" });
                    break;
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
        this.status = 'pending';
        this.gamestate = new Gamestate(); //need to pass lang from somewhere
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

function findEmptyRoomID(rooms) {
    const cpRooms = Array.from(rooms);
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
    const urlinstance = request.url;
    const uid = uuid().slice(0, 8);
    const first = url.parse(urlinstance, true).query.first;
    const isFirst = first === `true`;


    const passedRoomID = url.parse(urlinstance, true).query.roomID;
    let roomID = null;
    if (passedRoomID == '') {
        roomID = findEmptyRoomID(gameRooms);
    } else {
        roomID = passedRoomID;
    }
    const room = gameRooms.get(roomID);
    const link = `http://localhost:${port}/game.html?first=false&roomID=${roomID}`;

    if (!room) {
        connection.close(1008, 'wrong room code');
        console.log(`there is no room with id ${roomID}, GET OUT!`);
        return;
    }

    if (isFirst) {
        if (room) {  //there is no room if all of them are full
            room.hostID = uid;
            room.hostConnection = connection;

            room.broadcast("host_joined_room", room);
        } else console.log('no room');

    } else {
        const roomID = url.parse(urlinstance, true).query.roomID;
        const room = gameRooms.get(roomID);

        if (room) {  //there is no room if all of them are full
            room.guestID = uid;
            room.guestConnection = connection;

            room.broadcast("guest_joined_room", room);

            console.log(`Guest ${uid} connected to room ${roomID}, starting the game`);
            //mind the closing

            room.broadcast('game_starts', {});
            handleGameStart(room).then(
                () => console.log(`game initialized, initial state: \n ${room.gamestate}`),
                () => console.log('game init failed'));
            room.broadcast('share_gamestate', room.gamestate);

        } else console.log('no room');
    }

    connection.on('message', (message) => {
        message = JSON.parse(message.toString());
        console.log(`received message ${message.type} from ${uid} in room ${room.roomID}`);

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
                room.gamestate.lang = message.data.lang;
                room.broadcast('gamelink', { link: link }, 'host');
                break;
            default:
                console.log(`Unknown message, type: ${message.type}`);
        }
    });

    connection.on('close', () => {
        if (room.status === 'pending') {
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
        }
    })

    connection.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
})

httppserver.listen(port, () => {
    createRooms();
    console.log(`server running on port ${port}`);
});