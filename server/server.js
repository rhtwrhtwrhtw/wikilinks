const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const uuid = require('uuid').v4;
const { WebSocketServer, WebSocket } = require('ws');

const { Gamestate, createGame } = require('./game.js');

const httpserver = http.createServer((request, response) => {
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
                case 'gameclient.js':
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



const wss = new WebSocketServer({
    server: httpserver,
    clientTracking: true,
    verifyClient: false
});
const port = process.env.PORT || 9999;
const HOSTNAME = 'localhost:9999';
const nOfRooms = 100;

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
        this.gamestate = {};
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
    console.log(`created ${n} rooms`);
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
    } catch (error) {
        console.error('Failed to initialize game:', error);
        throw error;
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
    let uid = url.parse(urlinstance, true).query.uid;
    const type = url.parse(urlinstance, true).query.type;
    let roomID = url.parse(urlinstance, true).query.roomID;

    if (!uid) uid = uuid().slice(0, 8);

    if (!roomID) roomID = findEmptyRoomID();
    const room = gameRooms.get(roomID);

    if (!room) {
        connection.close(1008, 'wrong room code');
        console.log(`there is no room with id ${roomID}, GET OUT!`);
        return;
    }

    switch (type) {
        case 'lobby':
            console.log(`user ${uid} has entered the lobby, preparing room ${roomID}`);
            room.lobby = connection;
            break;
        case 'host':
            if (room.status === 'playing') {
                console.log(`host ${uid} has reconnected to room ${roomID}`);
                room.hostConnection = connection;
                connection.send(JSON.stringify({ type: 'restore_gamestate', data: room.gamestate }));
                break;
            }

            console.log(`host ${uid} has joined room ${roomID}`);
            room.hostID = uid;
            room.hostConnection = connection;
            connection.send(JSON.stringify({ type: 'set_uid', data: uid }));
            break;
        case 'guest':
            if (room.status === 'playing') {
                console.log(`guest ${uid} has reconnected to room ${roomID}`);
                room.guestConnection = connection;
                connection.send(JSON.stringify({ type: 'restore_gamestate', data: room.gamestate }));
                break;
            }

            console.log(`guest ${uid} has joined room ${roomID}`);
            room.guestID = uid;
            room.guestConnection = connection;
            connection.send(JSON.stringify({ type: 'set_uid', data: uid }));
            room.lobby.send(JSON.stringify({ type: 'game_starts', data: {} }));
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

            case 'host_transfer':
                if (room.status === 'pending') {
                    handleGameStart(room).then(
                        () => {
                            console.log(`game initialized, initial links:`);
                            console.log(`host: ${room.gamestate.hostLink.title}`);
                            console.log(`guest: ${room.gamestate.guestLink.title}`);
                            room.broadcast('initial_gamestate', room.gamestate);
                            room.status = 'playing';
                        }); // things can break here and I probably need a better way of handling it
                } else {
                    console.log('no transfer needed, reconnection');
                }
                break;
            case 'next_move':
                const article = message.data.name;
                room.gamestate.getNext(true, article)
                    .then(() => console.log(`next article for host fetched succesfully`));
                break;
            case 'generate_link':
                const guestuid = uuid().slice(0, 8);
                const hostuid = uid;
                const link = `http://${HOSTNAME}/game.html?type=guest&uid=${guestuid}&roomID=${roomID}`; // roomID shold be last
                room.gamestate = new Gamestate(message.data.lang)
                connection.send(JSON.stringify({ type: 'gamelink', data: { link: link, hostuid: hostuid } }));
                break;
            case 'host_choice':
                console.log(`host just chose ${message.data}`);
                room.gamestate.hostNext = message.data;
                if (room.gamestate.guestNext !== null) {
                    if (room.gamestate.hostNext === room.gamestate.guestNext) {
                        console.log('victory!!!');
                        room.broadcast('victory');
                        break;
                    }

                    console.log('running next move');
                    Promise.all([
                        room.gamestate.getNext(true),  // for host
                        room.gamestate.getNext(false)  // for guest
                    ]).then(() => {
                        room.broadcast('restore_gamestate', room.gamestate);
                        room.gamestate.guestNext = null;
                        room.gamestate.hostNext = null;
                    });

                }
                break;
            case 'guest_choice':
                console.log(`guest just chose ${message.data}`);
                room.gamestate.guestNext = message.data;
                if (room.gamestate.hostNext !== null) {
                    if (room.gamestate.hostNext === room.gamestate.guestNext) {
                        console.log('victory!!!');
                        room.broadcast('victory');
                        break;
                    }

                    console.log('running next move');
                    Promise.all([
                        room.gamestate.getNext(true),  // for host
                        room.gamestate.getNext(false)  // for guest
                    ]).then(() => {
                        room.broadcast('restore_gamestate', room.gamestate);
                        room.gamestate.guestNext = null;
                        room.gamestate.hostNext = null;
                    });
                }
                break;
            default:
                console.log(`Unknown message, type: ${message.type}`);
        }
    });

    connection.on('close', () => {
        switch (type) {
            case 'lobby':
                if (room.guestConnection === null) {
                    console.log(`host ${uid} left the lobby for room ${roomID} before starting the game`);
                    gameRooms.delete(roomID);
                    createRooms(1);
                    return;
                } else console.log(`lobby for room ${roomID} was discarded successfully`);
                break;
            case 'host':
                console.log(`host ${room.hostID} disconnected from room ${roomID}`);
                if (room.hostConnection.readyState === WebSocket.CLOSED &&
                    room.guestConnection.readyState === WebSocket.CLOSED) {
                    console.log(`room ${roomID} is empty, cleaning up`);
                    gameRooms.delete(roomID);
                    createRooms(1);
                }
                break;
            case 'guest':
                console.log(`guest ${room.guestID} disconnected from room ${roomID}`);
                if (room.hostConnection.readyState === WebSocket.CLOSED &&
                    room.guestConnection.readyState === WebSocket.CLOSED) {
                    console.log(`room ${roomID} is empty, cleaning up`);
                    gameRooms.delete(roomID);
                    createRooms(1);
                }
                break;
        }
    })

    connection.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
})

httpserver.listen(port, '0.0.0.0', () => {
    createRooms();
    console.log(`server running on port ${port}`);
});