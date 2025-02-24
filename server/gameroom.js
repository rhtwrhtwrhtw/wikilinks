const { WebSocket } = require('ws');

const Logger = require('./logger.js');

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

    async handleGameStart() {
        try {
            await this.gamestate.init();
        } catch (error) {
            console.error('Failed to initialize game:', error);
            throw error;
        }
    }
}



module.exports = {
    Gameroom
}