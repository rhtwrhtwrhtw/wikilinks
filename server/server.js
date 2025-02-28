const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const { WebSocketServer, WebSocket } = require('ws');
const uuid = require('uuid').v4;

const Logger = require('./logger.js')
const { Gameroom } = require('./gameroom.js');
const { Gamestate } = require('./gamelogic.js');
const { checkValidity } = require('./links.js');

const serverlog = new Logger('server.log');
const lobbylog = new Logger('lobby.log');

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

    //serverlog.write(`${request.socket.remoteAddress} requested file ${trimLink}`);

    const file = path.join(__dirname, '..', 'client', trimLink);
    fs.readFile(file, (error, content) => {
        if (error) {
            serverlog.write(`file ${file} not found`);
            response.writeHead(404);
            response.end();
        } else {
            //serverlog.write(`serving ${file} to ${request.socket.remoteAddress}`);
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
                case 'wikilinks-styles.css':
                    response.writeHead(200, { "Content-type": "text/css" });
                    break;
                case 'W.png':
                    response.writeHead(200, { "Content-Type": "image/png" });
                    break;
                case 'throbber.gif':
                    response.writeHead(200, { "Content-Type": "image/gif" });
                    break;
                case 'test.txt':
                case 'rules.txt':
                    response.writeHead(200, { "Content-Type": "text/plain" });
                    break;
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

const rooms = new Map();

wss.on('connection', (connection, request) => {
    const urlinstance = request.url;
    const type = url.parse(urlinstance, true).query.type;
    let roomID = url.parse(urlinstance, true).query.roomID;
    let room;

    switch (type) {
        default:
            serverlog.write(`connection to lobby at ${request.socket.remoteAddress}`);
            break;
        case 'host':
            room = rooms.get(roomID);

            if (room.status === 'playing') {
                room.logger.write(`host has reconnected to room ${roomID}`);
                room.hostConnection = connection;
                connection.send(JSON.stringify({ type: 'restore_gamestate', data: room.gamestate }));
                break;
            }

            room.logger.write(`host has joined room ${roomID}`);
            room.hostConnection = connection;
            break;
        case 'guest':
            room = rooms.get(roomID);
            if (room.status === 'playing') {
                room.logger.write(`guest has reconnected to room ${roomID}`);
                room.guestConnection = connection;
                connection.send(JSON.stringify({ type: 'restore_gamestate', data: room.gamestate }));
                break;
            }

            room.logger.write(`guest has joined room ${roomID}`);
            room.guestConnection = connection;
            room.lobby.send(JSON.stringify({ type: 'game_starts', data: {} }));
            break;
    }

    connection.on('message', (message) => {
        message = JSON.parse(message.toString());
        if (room) {
            room.logger.write(`received message ${message.type}`);
        } else {
            lobbylog.write(`received message ${message.type} from ${request.socket.remoteAddress}`);
        }

        switch (message.type) {
            case 'init_ID':
                if (message.data === null) {
                    lobbylog.write(`connection to lobby at ${request.socket.remoteAddress}`);
                    roomID = uuid().slice(0, 7);
                    room = new Gameroom(roomID);
                    room.lobby = connection;

                    rooms.set(roomID, room);

                    connection.send(JSON.stringify({
                        type: 'ID',
                        data: roomID
                    }));
                } else if (message.data !== null) {
                    roomID = message.data;
                    lobbylog.write(`reconnection to lobby for ${roomID}`)
                    room = rooms.get(roomID);
                }
                break;
            case 'host_transfer':
                if (room.status !== 'playing') {
                    room.handleGameStart().then(
                        () => {
                            room.logger.write(`game initialized, initial links:`);
                            room.logger.write(`host: ${room.gamestate.hostLink.title}`);
                            room.logger.write(`guest: ${room.gamestate.guestLink.title}`);
                            room.broadcast('initial_gamestate', room.gamestate);
                            room.status = 'playing';
                        });
                } else {
                    room.logger.write('no transfer needed, reconnection');
                }

                break;
            case 'generate_link':
                const link = `http://${HOSTNAME}/game.html?type=guest&roomID=${roomID}`;
                checkValidity(message).then(result => {
                    const returnMessage = (result === true) ? link : result;
                    if (result === true) {
                        room.status = 'preparing';
                        room.gamestate = new Gamestate(message.data.lang,
                            message.data.artforhost,
                            message.data.artforguest,
                            room.logger);
                    }
                    connection.send(JSON.stringify({
                        type: 'gamelink',
                        data: returnMessage
                    }));
                    lobbylog.write(`sending link to ${request.socket.remoteAddress}`);
                })
                break;
            case 'choice':
                const { choice, sentfrom } = message.data;
                room.logger.write(`${sentfrom} just chose ${choice}`);
                if (sentfrom === 'host') {
                    room.gamestate.hostNext = choice;
                } else if (sentfrom === 'guest') {
                    room.gamestate.guestNext = choice;
                }
                if (room.gamestate.guestNext !== null &&
                    room.gamestate.hostNext !== null) {
                    if (room.gamestate.hostNext === room.gamestate.guestNext) {
                        room.broadcast('victory');
                        break;
                    }

                    room.logger.write('running next move');
                    Promise.all([
                        room.gamestate.getNext('host'),  // for host
                        room.gamestate.getNext('guest')  // for guest
                    ]).then(() => {
                        room.broadcast('restore_gamestate', room.gamestate);
                        room.gamestate.guestNext = null;
                        room.gamestate.hostNext = null;
                    });
                }
                break;
            case 'clear_choice':
                if (message.data.sentfrom === 'host') {
                    room.gamestate.hostNext = null;
                } else if (message.data.sentfrom === 'guest') {
                    room.gamestate.guestNext = null;
                }
                break;
            case 'give_up':
                if (message.data.sentfrom === 'host') {
                    room.broadcast('opponent_gave_up', {}, 'guest');
                } else if (message.data.sentfrom === 'guest') {
                    room.broadcast('opponent_gave_up', {}, 'host');
                }
                room.broadcast('opponent_gave_up', {}, 'guest');
            case 'another_one':
                if (message.data.sentfrom === 'host') room.hostWantsNext = true;
                if (message.data.sentfrom === 'guest') room.guestWantsNext = true;

                if (room.hostWantsNext && room.guestWantsNext) {
                    room.handleGameStart().then(
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
            case 'left_after_win':
                if (message.data.sentfrom === 'host') {
                    room.broadcast('opponent_left', {}, 'guest');
                } else if (message.data.sentfrom === 'guest') {
                    room.broadcast('opponent_left', {}, 'host');
                }
            case 'clear':
                rooms.delete(roomID);
                createRooms(1);
            default:
                room.logger.write(`Unknown message, type: ${message.type}`);
        }
    });

    connection.on('close', () => {
        switch (type) {
            case 'host':
                room.logger.write(`host disconnected from room ${roomID}`);
                if (room.hostConnection.readyState === WebSocket.CLOSED &&
                    room.guestConnection.readyState === WebSocket.CLOSED) {
                    room.logger.write(`room ${roomID} is empty, cleaning up`);
                    rooms.delete(roomID);
                }
                break;
            case 'guest':
                room.logger.write(`guest disconnected from room ${roomID}`);
                if (room.hostConnection.readyState === WebSocket.CLOSED &&
                    room.guestConnection.readyState === WebSocket.CLOSED) {
                    room.logger.write(`room ${roomID} is empty, cleaning up`);
                    rooms.delete(roomID);
                }
                break;
            default:
                if (!room) {
                    lobbylog.write(`lobby abandoned with no room`)
                    return;
                }
                switch (room.status) {
                    case 'pending':
                        lobbylog.write(`lobby for ${roomID} was abandoned`)
                        break;
                    case 'preparing':
                        lobbylog.write(`lobby for ${roomID} was abandoned with a room prepared`)
                        break;
                    case 'playing':
                        lobbylog.write(`this should not happen`);
                        break;
                }
        }
    })

    connection.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
})

httpserver.listen(port, '0.0.0.0', () => {
    serverlog.write(`server running on port ${port}, address ${process.env.ADDRESS}`);
});