const address = 'localhost:9999';

const params = new URLSearchParams(window.location.search);
if (!params.has('type')) params.set('type', 'lobby');

const url = 'http://' + address + '?' + params.toString();
console.log(url);
window.history.replaceState({}, '', url);
ws = new WebSocket(url);

let roomID; 

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log(`received message ${message.type}`);

    switch (message.type) {
        case 'gamelink':
            const linkstring = document.createElement('p');
            linkstring.textContent = message.data;
            roomID = message.data.split('=')[2];

            const copybutton = document.createElement('button');
            copybutton.type = "button";
            copybutton.textContent = "Copy";
            copybutton.onclick = () => {
                navigator.clipboard.writeText(message.data);
            }

            document.querySelector('.getlink').appendChild(linkstring);
            document.querySelector('.getlink').appendChild(copybutton);
            break;
        case 'game_starts':
            console.log('game is starting');
            window.location.href = `/game.html?type=host&roomID=${roomID}`;
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