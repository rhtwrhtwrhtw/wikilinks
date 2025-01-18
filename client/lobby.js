const params = new URLSearchParams(window.location.search);
if (!params.has('type')) params.set('type', 'lobby');
window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const address = window.location.host;
ws = new WebSocket(`${wsProtocol}//${address}`);

let roomID;
let hostuid;

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log(`received message ${message.type}`);
    console.log(message.data)

    switch (message.type) {
        case 'gamelink':
            const linkstring = document.createElement('p');
            linkstring.textContent = message.data.link;
            linkstring.id = 'linkstring';
            roomID = message.data.link.split('=')[3]; //this is why roomID is last in links
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

const hostinput = document.getElementById('artforhost');
let artforhost = '';
const guestinput = document.getElementById('artforguest');
let artforguest = '';

function linkByChoice(input, art) {
    if (input.value != '') {
        let article = input.value.split('#')[0];
        article = article.split('/').pop();
        article = encodeURIComponent(article);
        art = article;
    }
}

const list = document.getElementById('lang');
const button = document.getElementById('linkbutton');

function passLinkOnce() {
    ws.send(JSON.stringify({
        type: 'generate_link',
        data: { lang: list.value,
            artforhost: artforhost,
            artforguest: artforguest
        }
    }),);
    //button.removeEventListener('click', passLinkOnce);
}

button.addEventListener('click', passLinkOnce);

window.addEventListener('DOMContentLoaded', () => {
    console.log('loaded');
});