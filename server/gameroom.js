const uuid = require('uuid').v4;
const { WebSocket } = require('ws');

const Logger = require('./logger.js');

const nOfRooms = 100;
const gameRooms = new Map();

const logger = new Logger();

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
    for (const [roomID, room] of gameRooms) {
      if (room.isEmpty() && room.status === 'pending') {
        return roomID;
      }
    }
    logger.serverWrite('failed to fetch an empty room');
    return false;
  }

function findRoomByUID(uid) {
    const copy = Array.from(gameRooms).map(arr => arr[1]);
    for (room of copy) {
        if (uid === room.hostID || uid === room.guestID) return room;
    }
    logger.serverWrite(`there is not a room with uid ${uid}`);
}

async function handleGameStart(room) {
    try {
        await room.gamestate.init();
    } catch (error) {
        console.error('Failed to initialize game:', error);
        throw error;
    }
}

module.exports = {
    Gameroom,
    createRooms, 
    findEmptyRoomID,
    findRoomByUID, 
    handleGameStart,
    gameRooms
}