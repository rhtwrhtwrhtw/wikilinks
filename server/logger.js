const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logfolder = '../../wikilinks/logs';
        this.serverlog = path.join(this.logfolder, 'serverlog.log');
        this.roomlog;
        this.roomID;
        this.hostID;
        this.guestID;
    }

    timestamp() {
        let date = new Date().toISOString(); 
        date = date.replace(/T/g, '_');
        date = date.replace(/Z/g, '');
        date = date.replace(/:/g, '-');
        return date; 
    }

    format(message) {
        const time = this.timestamp();
        const roomID = null || this.roomID;
        const hostID = null || this.hostID;
        const guestID = null || this.guestID;

        let result = {
            time, 
            message, 
            roomID,
            hostID,
            guestID
        }
        result = JSON.stringify(result) + '\n'; 
        return result;
    }

    async assignToRoom(roomID) {
        this.roomlog = path.join(this.logfolder, `${this.timestamp()}_${roomID}.log`);
    }

    async serverWrite(message) {
        const time = this.timestamp();
        const path = this.serverlog;
        const log = JSON.stringify({time, message}) + '\n';
        try {
            await fs.promises.appendFile(path, log); 
        } catch (error) {
            console.error('Error writing to serverlog:', error);
        } 
    }

    async write(message) {
        if (this.roomlog == null) {
            console.error('attempting to write using an unassigned logger');
        }
        const logpath = this.roomlog;
        message = this.format(message);
        try {
            await fs.promises.appendFile(logpath, message); 
        } catch (error) {
            console.error('Error writing to log:', error);
        } 
    }
}

module.exports = Logger;
