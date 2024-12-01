const address = 'localhost:9999';

const params = new URLSearchParams(window.location.search);
if (!params.has('type')) params.set('type', 'lobby');

const url = 'http://' + address + '?' + params.toString();
console.log(url);
window.history.replaceState({}, '', url);
ws = new WebSocket(url);

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
            roomID = message.data.link.split('=')[3]; //this is why roomID is last in links
            hostuid = message.data.hostuid; 

            const copybutton = document.createElement('button');
            copybutton.type = "button";
            copybutton.textContent = "Copy";
            copybutton.onclick = () => {
                navigator.clipboard.writeText(message.data.link);
            }

            document.querySelector('.getlink').appendChild(linkstring);
            document.querySelector('.getlink').appendChild(copybutton);
            break;
        case 'game_starts':
            console.log('game is starting');
            window.location.href = `/game.html?type=host&uid=${hostuid}&roomID=${roomID}`;
            break;
    }
}



const list = document.getElementById('lang');
const button = document.getElementById('linkbutton');

function passLinkOnce() {
    ws.send(JSON.stringify({
        type: 'generate_link',
        data: { lang: list.value }
    }),);
    //button.removeEventListener('click', passLinkOnce);
}

button.addEventListener('click', passLinkOnce);



window.addEventListener('DOMContentLoaded', () => {
    console.log('loaded');
});