const fs = require('fs');
const path = require('path');
const logfolder = '../../wikilinks/logs';

class Logger {
    constructor(filename = null) {
        this.logfolder = logfolder;
        this.filename = filename ? path.join(this.logfolder, filename) : null;
        this.roomlog;
        this.roomID;
    }

    timestamp() {
        let date = new Date().toISOString();
        date = date.replace(/T/g, '_');
        date = date.replace(/Z/g, '');
        date = date.replace(/:/g, '-');
        date = date.replace(/\.\d\d\d/g, '');
        return date;
    }

    format(message) {
        const time = this.timestamp();

        let result = [
            time,
            message
        ]
        result = JSON.stringify(result) + '\n';
        return result;
    }

    async assignToRoom(roomID) {
        this.roomlog = path.join(this.logfolder, `${this.timestamp()}_${roomID}.log`);
    }

    async write(message) {
        message = this.format(message);

        if (this.filename) {
            try {
                await fs.promises.appendFile(this.filename, message);
            } catch (error) {
                console.error(`Error writing to ${this.filename}:`, error);
            }
            return;
        }

        if (this.roomlog == null) {
            console.error('attempting to write using an unassigned logger');
        }

        try {
            await fs.promises.appendFile(this.roomlog, message);
        } catch (error) {
            console.error(`Error writing to ${this.roomlog}:`, error);
        }

    }
}

module.exports = Logger;