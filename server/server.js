const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const uuid = require('uuid').v4;
const { WebSocketServer, WebSocket } = require('ws');

const Logger = require('./logger.js')
const { Gamestate } = require('./game.js');
const { checkValidity } = require('./links.js');


const logger = new Logger(); //for server logs

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

    logger.serverWrite(`${request.socket.remoteAddress} requested file ${trimLink}`);

    const file = path.join(__dirname, '..', 'client', trimLink);
    fs.readFile(file, (error, content) => {
        if (error) {
            logger.serverWrite(`file ${file} not found`);
            response.writeHead(404);
            response.end();
        } else {
            logger.serverWrite(`serving ${file} to ${request.socket.remoteAddress}`);
            response.setHeader("X-Content-Type-Options", "nosniff");
            switch (trimLink) {
                case 'index.html':
                case 'game.html':
                case 'test.html':
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
                case 'test.txt':
                    response.writeHead(200, { "Content-Type": "text/plain" });
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
const HOSTNAME = process.env.ADDRESS || 'localhost:9999';
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
        this.hostWantsNext = false;
        this.guestWantsNext = false;

        this.logger = new Logger();
        this.logger.assignToRoom(roomID);
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
                this.logger.write(`host ${this.hostID} of room ${this.roomID} is not open`);
            }
        } else if (toWhom === null) {
            this.logger.write(`no host to receive message ${type}`);
        };

        if (this.guestConnection && toWhom !== 'host') {
            if (this.guestConnection.readyState === WebSocket.OPEN) {
                this.guestConnection.send(message);
            } else {
                this.logger.write(`guest ${this.guestID} of room ${this.roomID} is not open`);
            }
        } else if (toWhom === null) {
            this.logger.write(`no guest to receive message ${type}`);
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
    logger.serverWrite(`created ${n} rooms`);
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
    logger.serverWrite('failed to fetch an empty room');
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
    logger.serverWrite(`there is not a room with uid ${uid}`);
}

wss.on('connection', (connection, request) => {
    const urlinstance = request.url;
    let uid = url.parse(urlinstance, true).query.uid;
    const type = url.parse(urlinstance, true).query.type;
    let roomID = url.parse(urlinstance, true).query.roomID;
    const passlogger = logger;

    if (!uid) uid = uuid().slice(0, 8);

    if (!roomID) roomID = findEmptyRoomID();
    const room = gameRooms.get(roomID);

    if (!room) {
        connection.close(1008, 'wrong room code');
        passlogger.serverWrite(`there is no room with id ${roomID}, GET OUT!`);
        return;
    }

    switch (type) {
        case 'host':
            if (room.status === 'playing') {
                room.logger.write(`host ${uid} has reconnected to room ${roomID}`);
                room.hostConnection = connection;
                connection.send(JSON.stringify({ type: 'restore_gamestate', data: room.gamestate }));
                break;
            }

            room.logger.write(`host ${uid} has joined room ${roomID}`);
            room.hostID = uid;
            room.hostConnection = connection;
            connection.send(JSON.stringify({ type: 'set_uid', data: uid }));
            break;
        case 'guest':
            if (room.status === 'playing') {
                room.logger.write(`guest ${uid} has reconnected to room ${roomID}`);
                room.guestConnection = connection;
                connection.send(JSON.stringify({ type: 'restore_gamestate', data: room.gamestate }));
                break;
            }

            room.logger.write(`guest ${uid} has joined room ${roomID}`);
            room.guestID = uid;
            room.guestConnection = connection;
            connection.send(JSON.stringify({ type: 'set_uid', data: uid }));
            room.lobby.send(JSON.stringify({ type: 'game_starts', data: {} }));
            break;
        default:
            room.logger.write(`user ${uid} has entered the lobby, preparing room ${roomID}`);
            room.lobby = connection;
            break;
    }

    connection.on('message', (message) => {
        message = JSON.parse(message.toString());
        room.logger.write(`received message ${message.type}`);

        switch (message.type) {
            case 'printrooms':
                room.logger.write(gameRooms);
                break;

            case 'host_transfer':
                if (room.status === 'pending') {
                    handleGameStart(room).then(
                        () => {
                            room.logger.write(`game initialized, initial links:`);
                            room.logger.write(`host: ${room.gamestate.hostLink.title}`);
                            room.logger.write(`guest: ${room.gamestate.guestLink.title}`);
                            room.broadcast('initial_gamestate', room.gamestate);
                            room.status = 'playing';
                        }); // things can break here and I probably need a better way of handling it
                } else {
                    room.logger.write('no transfer needed, reconnection');
                }
                break;
            case 'next_move':
                const article = message.data.name;
                room.gamestate.getNext(true, article)
                    .then(() => room.logger.write(`next article for host fetched succesfully`));
                break;
            case 'generate_link':
                const guestuid = uuid().slice(0, 8);
                const hostuid = uid;
                const link = `http://${HOSTNAME}/game.html?type=guest&uid=${guestuid}&roomID=${roomID}`; // roomID shold be last
                checkValidity(message).then(result => {
                    const returnMessage = (result === true) ? link : result;
                    if (result === true) {
                        room.gamestate = new Gamestate(message.data.lang,
                            message.data.artforhost,
                            message.data.artforguest,
                            room.logger);
                    }
                    connection.send(JSON.stringify({
                        type: 'gamelink',
                        data: {
                            link: returnMessage,
                            hostuid: hostuid
                        }
                    }));
                })
                break;
            case 'host_choice':
                room.logger.write(`host just chose ${message.data}`);
                room.gamestate.hostNext = message.data;
                if (room.gamestate.guestNext !== null) {
                    if (room.gamestate.hostNext === room.gamestate.guestNext) {
                        room.logger.write('victory!!!');
                        room.broadcast('victory');
                        break;
                    }

                    room.logger.write('running next move');
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
                room.logger.write(`guest just chose ${message.data}`);
                room.gamestate.guestNext = message.data;
                if (room.gamestate.hostNext !== null) {
                    if (room.gamestate.hostNext === room.gamestate.guestNext) {
                        room.logger.write('victory!!!');
                        room.broadcast('victory');
                        break;
                    }

                    room.logger.write('running next move');
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
            case 'host_clear_choice':
                room.gamestate.hostNext = null;
                break;
            case 'guest_clear_choice':
                room.gamestate.hostNext = null;
                break;
            case 'host_gave_up':
                room.broadcast('opponent_gave_up', {}, 'guest');
            case 'guest_gave_up':
                room.broadcast('opponent_gave_up', {}, 'host');
            case 'another_one':
                if (message.data.sentfrom === 'host') room.hostWantsNext = true;
                if (message.data.sentfrom === 'guest') room.guestWantsNext = true;

                if (room.hostWantsNext && room.guestWantsNext) {
                    handleGameStart(room).then(
                        () => {
                            room.logger.write(`game reinitialized, links:`);
                            room.logger.write(`host: ${room.gamestate.hostLink.title}`);
                            room.logger.write(`guest: ${room.gamestate.guestLink.title}`);
                            room.broadcast('initial_gamestate', room.gamestate);
                            room.broadcast('clear_button', {});
                        });
                    room.hostWantsNext = false;
                    room.guestWantsNext = false;
                }
                break;
            default:
                room.logger.write(`Unknown message, type: ${message.type}`);
        }
    });

    connection.on('close', () => {
        switch (type) {
            case 'lobby':
                if (room.guestConnection === null) {
                    room.logger.write(`host ${uid} left the lobby for room ${roomID} before starting the game`);
                    gameRooms.delete(roomID);
                    createRooms(1);
                    return;
                } else room.logger.write(`lobby for room ${roomID} was discarded successfully`);
                break;
            case 'host':
                room.logger.write(`host ${room.hostID} disconnected from room ${roomID}`);
                if (room.hostConnection.readyState === WebSocket.CLOSED &&
                    room.guestConnection.readyState === WebSocket.CLOSED) {
                    room.logger.write(`room ${roomID} is empty, cleaning up`);
                    gameRooms.delete(roomID);
                    createRooms(1);
                }
                break;
            case 'guest':
                room.logger.write(`guest ${room.guestID} disconnected from room ${roomID}`);
                if (room.hostConnection.readyState === WebSocket.CLOSED &&
                    room.guestConnection.readyState === WebSocket.CLOSED) {
                    room.logger.write(`room ${roomID} is empty, cleaning up`);
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
    logger.serverWrite(`server running on port ${port}`);
    logger.serverWrite('address is ' + process.env.ADDRESS);
});