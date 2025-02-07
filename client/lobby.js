const params = new URLSearchParams(window.location.search);
if (!params.has('type')) params.set('type', 'lobby');
window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const address = window.location.host;
ws = new WebSocket(`${wsProtocol}//${address}`);

let roomID;
let hostuid;
let artforhost = null;
let artforguest = null;

const hosttextinput = document.getElementById('artforhost');
const hostcheckbox = document.getElementById('randomhost');
const guestexttinput = document.getElementById('artforguest');
const guestcheckbox = document.getElementById('randomguest');

function checkboxEvent(checkbox, input) {
    const storageName = (checkbox === hostcheckbox) ? 'hostcheckboxState' : 'guestcheckboxState';
    if (checkbox.value === 'random') {
        checkbox.value = 'nonrandom';
        sessionStorage.setItem(storageName, 'nonrandom');
        input.disabled = false;
    } else if (checkbox.value === 'nonrandom') {
        checkbox.value = 'random';
        sessionStorage.setItem(storageName, 'random');
        input.disabled = true;
    }
    console.log(sessionStorage)
}

hostcheckbox.addEventListener('change', () => checkboxEvent(hostcheckbox, hosttextinput));
guestcheckbox.addEventListener('change', () => checkboxEvent(guestcheckbox, guestexttinput));

function passChosenArticle(checkbox, input) {
    if (checkbox.value === 'random') { return };
    if (input.value === null) {
        return "Please paste a link to a non-random article or checkmark 'Random'";
    }
    const link = input.value.trim();
    const test = checkWikilinkValidity(link);
    switch (test) {
        case 'langerror':
            return 'Please make sure the link leads to an article in a supported language';
        case 'domainerror':
            return 'Please enter a valid wikipedia link';
        case false:
            return 'Please enter a valid link';
        case true:
            if (checkbox === hostcheckbox) {
                artforhost = link
            } else if (checkbox === guestcheckbox) {
                artforguest = link
            }
        default:
            console.log('linktesting fucked up');

    }


}

const list = document.getElementById('lang');
const button = document.getElementById('linkbutton');

function passLinkOnce() {
    ws.send(JSON.stringify({
        type: 'generate_link',
        data: {
            lang: list.value,
            artforhost: artforhost,
            artforguest: artforguest
        }
    }),);
    //button.removeEventListener('click', passLinkOnce);
}

button.addEventListener('click', passLinkOnce);

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log(`received message ${message.type}`);
    console.log(message.data)

    switch (message.type) {
        case 'gamelink':
            //checking if there are starting articles and appending them to the message
            passChosenArticle(hosttextinput, hostcheckbox);
            passChosenArticle(guestexttinput, guestcheckbox);

            //generating link and the copy button
            const linkstring = document.createElement('p');
            linkstring.textContent = message.data.link;
            linkstring.id = 'linkstring';
            roomID = message.data.link.split('=').pop();
            hostuid = message.data.hostuid;

            const copybutton = document.createElement('button');
            copybutton.type = "button";
            copybutton.textContent = "Copy";
            copybutton.id = 'copybutton';
            copybutton.onclick = () => {
                navigator.clipboard.writeText(message.data.link);
            }

            document.getElementById('linktosend').innerHTML = '';
            document.getElementById('linktosend').appendChild(linkstring);
            document.getElementById('linktosend').appendChild(copybutton);
            break;
        case 'game_starts':
            console.log('game is starting');
            window.location.href = `/game.html?type=host&uid=${hostuid}&roomID=${roomID}`;
            break;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    console.log(sessionStorage);
    const hostcheckboxState = sessionStorage.getItem('hostcheckboxState');
    const guestcheckboxState = sessionStorage.getItem('guestcheckboxState');

    if (hostcheckboxState === null) {
        sessionStorage.setItem('hostcheckboxState', 'random');
        hosttextinput.disabled = true;
        console.log('state set')
    } else {
        hostcheckbox.value = hostcheckboxState;
        hostcheckbox.checked = hostcheckboxState === "random";
        hosttextinput.disabled = hostcheckboxState === "random";
        console.log('state loaded')
    }
    if (guestcheckboxState === null) {
        sessionStorage.setItem('guestcheckboxState', 'random');
        guestexttinput.disabled = true;
    } else {
        guestcheckbox.value = guestcheckboxState;
        guestcheckbox.checked = guestcheckboxState === "random";
        guestexttinput.disabled = guestcheckboxState === "random";
    }

});

function checkWikilinkValidity(link) {
    try {
        const url = new URL(link);
        const options = {
            domains: ['wikipedia.org'],
            pathPattern: /^\/wiki\/.+/,
            protocols: ['https', 'http'],
            languages: ['en', 'simple', 'es', 'ru', 'kk', 'de']
        };

        if (options.protocols) {
            if (!options.protocols.includes(url.protocol.replace(':', ''))) {
                return false;
            }
        } else if (url.protocol !== 'https:') {
            return false;
        }

        if (options.domains) {
            const domain = url.hostname;
            if (!options.domains.some(d => domain.endsWith(d))) {
                return 'domainerror';
            }
        }

        if (options.pathPattern) {
            if (!options.pathPattern.test(url.pathname)) {
                return false;
            }
        }

        if (options.languages) {
            if (!options.languages.some(lang => domain.startsWith(lang))) {
                return 'langerror';
            }
        }

        return true;
    } catch (err) {
        return false;
    }
}