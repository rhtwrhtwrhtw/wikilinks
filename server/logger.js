const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logfolder = '../../wikilinks/logs';
        this.serverlog = path.join(this.logfolder, 'serverlog.log');

    }

    timestamp() {
        let date = new Date().toISOString(); 
        date = date.replace(/T|Z/g, ' ');
        date = date.replace(/:/g, '-');
        return date; 
    }

    format(message, metadata = {}) {
        const time = this.timestamp();
        let result = {
            time, 
            message, 
            metadata
        }
        result = JSON.stringify(result) + '\n'; 
        return result;
    }

    async serverWrite(message) {
        const time = this.timestamp();
        const path = this.serverlog;
        const log = JSON.stringify({time, message}) + '\n';
        try {
            await fs.promises.appendFile(path, log); 
        } catch (error) {
            console.error('Error writing to log:', error);
        } 
    }

    async write(file, message, metadata = {}) {
        const logpath = path.join(this.logfolder, file);
        message = this.format(message, metadata);
        try {
            await fs.promises.appendFile(logpath, message); 
        } catch (error) {
            console.error('Error writing to log:', error);
        } 
    }
}

const test = new Logger();
test.write('test.log', 'susus amogus');
test.serverWrite('amogus that lives on a server');

module.exports = Logger;
