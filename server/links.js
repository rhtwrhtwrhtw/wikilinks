const config = {
    domains: ['wikipedia.org'],
    pathPattern: /^\/wiki\/.+/,
    protocols: ['https', 'http'],
    languages: ['en', 'simple', 'es', 'ru', 'kk', 'de']
};

async function pingArticle(url) {
    let tries = 3;
    while (tries >= 0) {
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                signal: AbortSignal.timeout(1500)
            });
            if (!response.ok) return response.status;
            return true;
        } catch {
            tries--;
            console.log('retrying')
        }
    }
    return 'cant_connect';
}

async function validateInput(who, lang, checkbox, input) {
    if (checkbox == 'random') return true;

    const link = input.trim();
    if (link == '') {
        return `Please paste a link in the field for ${who}, or checkmark Random`
    };

    let url;
    try {
        url = new URL(link);
    } catch (error) {
        return 'Please enter a valid link';
    }

    if (link !== decodeURI(encodeURI(link))) {
        return `Please make sure link for ${who} does not contain invalid characters`;
    }

    if (!config.protocols.includes(url.protocol.replace(':', ''))) {
        return `Please make sure link for ${who} has valid protocol`;
    }

    if (!config.domains.some(d => url.hostname.endsWith(d))) {
        return `Please enter a wikipedia link for ${who}`;
    }

    if (!config.pathPattern.test(url.pathname)) {
        return `Please make sure link for ${who} leads directly to an article`;
    }

    if (!config.languages.some(l => url.hostname.startsWith(l))) {
        return `Please make sure the link for ${who} leads to an article in supported language`;
    }

    if (url.hostname.split('.').shift() !== lang) {
        return `Please make sure link for ${who} leads to an article in the chosen language`;
    }

    const pingResult = await pingArticle(url);
    switch (pingResult) {
        case 'cant_connect':
            return `Cannot reach article for ${who}`;
        case true:
            return true;
        default:
            if (typeof pingResult === 'number') {
                return `Got a ${pingResult} error while fetching article for ${who}`;
            }
            return `Unknown error while fetching article for ${who}`;
    }
}

export default async function checkValidity(message) {
    /*looks like: 
        {type: 'generate_link',
           data: {
               lang: list.value,
               hostcheckbox: hostcheckbox.value,
               artforhost: (hostcheckbox.value == 'random') ? '' : hosttextinput.value,
               guestcheckbox: guestcheckbox.value,
               artforguest: (guestcheckbox.value == 'random') ? '' : guestexttinput.value
           }} */
    message = message.data;
    if (message.hostcheckbox === 'random' && message.guestcheckbox === 'random') { return true };

    const [hostvalidity, guestvalidity] = await Promise.all([
        validateInput('host', message.lang, message.hostcheckbox, message.artforhost),
        validateInput('guest', message.lang, message.guestcheckbox, message.artforguest)
    ]);
    
    if (hostvalidity === true && guestvalidity === true) return true;
    let result = '';
    if (hostvalidity !== true) result = result + hostvalidity;
    if (guestvalidity !== true) result = result + '\n' + guestvalidity;

    return result;
}

const test = {
    type: 'generate_link',
    data: {
        lang: 'en',
        hostcheckbox: 'nonradom',
        artforhost: 'amogus',
        guestcheckbox: 'random',
        artforguest: ''
    }
}