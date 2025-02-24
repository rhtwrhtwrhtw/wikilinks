const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const address = window.location.host;
ws = new WebSocket(`${wsProtocol}//${address}`);

let roomID = sessionStorage.getItem('roomID');
let hostID = sessionStorage.getItem('hostID');
let guestID = sessionStorage.getItem('guestID');

ws.onopen = () => {
    ws.send(JSON.stringify({
        type: 'request_IDs',
        data: {
            roomID,
            hostID,
            guestID
        }
    }));
}


let rules;
fetch('rules.txt')
    .then(response => response.text())
    .then(data => {
        document.getElementById('rules').textContent = data;
        rules = data;
    })

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
}

hostcheckbox.addEventListener('change', () => checkboxEvent(hostcheckbox, hosttextinput));
guestcheckbox.addEventListener('change', () => checkboxEvent(guestcheckbox, guestexttinput));

const list = document.getElementById('lang');
const button = document.getElementById('linkbutton');

function passLink() {
    ws.send(JSON.stringify({
        type: 'generate_link',
        data: {
            lang: list.value,
            hostcheckbox: hostcheckbox.value,
            artforhost: (hostcheckbox.value == 'random') ? '' : hosttextinput.value,
            guestcheckbox: guestcheckbox.value,
            artforguest: (guestcheckbox.value == 'random') ? '' : guestexttinput.value
        }
    }));
}
button.addEventListener('click', passLink);

function displayLink(returnMessage) {
    const linkstring = document.createElement('pre');
    linkstring.textContent = returnMessage
    linkstring.id = 'linkstring';

    const copybutton = document.createElement('button');
    copybutton.type = "button";
    copybutton.textContent = "Copy";
    copybutton.id = 'copybutton';
    copybutton.onclick = () => {
        navigator.clipboard.writeText(returnMessage);
        copybutton.style.backgroundColor = '#00008B';
    }

    const copybuttonRules = document.createElement('button');
    copybuttonRules.type = "button";
    copybuttonRules.textContent = "Copy with rules";
    copybuttonRules.id = 'copybuttonRules';
    copybuttonRules.onclick = () => {
        const linkandrules = ["You are invited to play a game!",
            returnMessage,
            rules].join('\n');
        navigator.clipboard.writeText(linkandrules);
        copybuttonRules.style.backgroundColor = '#00008B';
    }
    const linktosend = document.getElementById('linktosend');
    linktosend.style.display = 'flex';
    linktosend.innerHTML = '';
    linktosend.appendChild(linkstring);
    linktosend.appendChild(copybutton);
    linktosend.appendChild(copybuttonRules);
}

function setID(id, label) {
    if (sessionStorage.getItem(label) === null) {
        sessionStorage.setItem(label, id);
    }
    return sessionStorage.getItem(label);
}

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log(message)

    switch (message.type) {
        case 'IDs':
            roomID = setID(message.data.roomID, 'roomID');
            hostID = setID(message.data.hostID, 'hostID');
            guestID = setID(message.data.guestID, 'guestID');
            break;
        case 'gamelink':
            displayLink(message.data);
            break;
        case 'game_starts':
            window.location.href = `/game.html?type=host&uid=${hostID}&roomID=${roomID}`;
            break;
        default:
            console.log(`received unknown message: ${message.type}`)
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const hostcheckboxState = sessionStorage.getItem('hostcheckboxState');
    const guestcheckboxState = sessionStorage.getItem('guestcheckboxState');

    if (hostcheckboxState === null) {
        sessionStorage.setItem('hostcheckboxState', 'random');
        hosttextinput.disabled = true;
    } else {
        hostcheckbox.value = hostcheckboxState;
        hostcheckbox.checked = hostcheckboxState === "random";
        hosttextinput.disabled = hostcheckboxState === "random";
    }
    if (guestcheckboxState === null) {
        sessionStorage.setItem('guestcheckboxState', 'random');
        guestexttinput.disabled = true;
    } else {
        guestcheckbox.value = guestcheckboxState;
        guestcheckbox.checked = guestcheckboxState === "random";
        guestexttinput.disabled = guestcheckboxState === "random";
    }

    console.log(sessionStorage);
    setTimeout(() => console.log(roomID, hostID, guestID, sessionStorage), 2000);
});