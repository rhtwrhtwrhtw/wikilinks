const params = new URLSearchParams(window.location.search);
if (!params.has('type')) params.set('type', 'lobby');
window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const address = window.location.host;
ws = new WebSocket(`${wsProtocol}//${address}`);

let roomID;
let hostuid;

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

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
   
    switch (message.type) {
        case 'gamelink':
            //generating link and the copy button
            const linkstring = document.createElement('pre');
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
            window.location.href = `/game.html?type=host&uid=${hostuid}&roomID=${roomID}`;
            break;
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
});