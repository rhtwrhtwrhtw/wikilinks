const cheerio = require('cheerio');

class Gamestate {
    constructor(lang) {
        this.lang = lang;
        this.hostLink = null;
        this.guestLink = null;
        this.hostArray = [];
        this.guestArray = [];
        this.hostNext = null;
        this.guestNext = null;
        this.isReady = false;
    }

    async init(startForHost = null, startForGuest = null) {
        console.log(`Init called with lang ${this.lang}, starts:`, startForHost, startForGuest);
        try {
            this.hostLink = (startForHost != null) ? await getByName(startForHost, this.lang) : await getAGoodOne(this.lang);
            this.guestLink = (startForGuest != null) ? await getByName(startForGuest, this.lang) : await getAGoodOne(this.lang);
            this.hostArray = [this.hostLink];
            this.guestArray = [this.guestLink];

            this.hostLink.links = await getHTMLbyName(this.hostLink.title, this.lang);
            this.guestLink.links = await getHTMLbyName(this.guestLink.title, this.lang);

            this.isReady = true;
        } catch (error) {
            console.error('Failed to initialize game state:', error);
        }
    }

    async getNext(isHost) {
        while (true) {
            try {
                if (!this.isReady) {
                    throw new Error("Game not initialized yet!");
                }

                const choice = isHost ? this.hostNext : this.guestNext;
                const request = `https://${this.lang}.wikipedia.org/w/api.php?action=query&format=json&prop=links&list=&titles=${encodeURIComponent(choice)}&formatversion=2&pllimit=500`;
                const response = await fetch(request);
                if (!response.ok) {
                    throw new Error(`failed to fetch ${choice}: ${response.status}`);
                }
                const data = await response.json();
                const article = data.query.pages[0];

                if (isHost) {
                    this.hostArray.push(article);
                    this.hostLink = article;
                    this.hostLink.links = await getHTMLbyName(this.hostLink.title, this.lang);
                } else {
                    this.guestArray.push(article);
                    this.guestLink = article;
                    this.guestLink.links = await getHTMLbyName(this.guestLink.title, this.lang);
                }
                break;
            } catch (error) {
                console.log(`there is a ${error.name} that says ${error.message}`);
                throw error;
            }
        }
    }
}

async function randomArticles(lang, n, linkN) {
    try {
        const request = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=info%7Clinks%7Clinkshere&generator=random&formatversion=2&pllimit=${linkN}&lhlimit=${linkN}&grnlimit=${n}&grnnamespace=0`;
        const response = await fetch(request, { timeout: 3000 });
        if (!response.ok) {
            throw new Error(`failed to fetch random articles: ${response.status}`);
        }
        const data = await response.json();
        const articles = data.query.pages.map(articleobject => ({
            title: articleobject.title,
            linksLength: articleobject.links.length,
            links: articleobject.links || 0,
        }));
        return articles;
    } catch (error) { //need to add errors for the cycling
        //console.log(`there is a ${error.name} that says ${error.message}`);
        throw error;
    }
}

async function getAGoodOne(lang, n = 8, linkN = 500) {
    let articles = []
    let errorcount = 0;
    for (; ;) {
        try {
            articles = await randomArticles(lang, n, linkN);
            break;
        } catch ({ name, message }) {
            if (name !== 'TypeError') {
                console.error(`non typerror: ${message}`);
                break;
            }
            console.warn(`TypeError in getAGoodOne: ${message}, retry`);
            errorcount++;
            if (errorcount >= 20) throw new Error('getAGoodOne failed');
        }
    }
    articles.filter(article => article.linksLength !== 0);
    articles = articles.sort((a, b) => b.linksLength - a.linksLength);
    return articles.shift();
}

async function getByName(name, lang) {
    console.log("getByName called with:", name, lang);
    while (true) {
        try {
            const request = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=links&list=&titles=${encodeURIComponent(name)}&formatversion=2&pllimit=500`;
            const response = await fetch(request);
            if (!response.ok) {
                throw new Error(`failed to fetch ${choice}: ${response.status}`);
            }
            const data = await response.json();
            const article = data.query.pages[0];

            console.log(`fetching by name ${name}, ${response.ok}`);
            return article;
        } catch (error) { //need to add errors for the cycling
            //console.log(`there is a ${error.name} that says ${error.message}`); 
            throw error;
        }
    }
}

async function getCleanLinks(title, lang) {
    while (true) {
        try {
            const request = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&titles=${encodeURIComponent(title)}&formatversion=2&rvprop=content&rvslots=main&rvlimit=1`;
            const response = await fetch(request);
            const data = await response.json();

            const text = data.query.pages[0].revisions[0].slots.main.content;
            const linkregex = /\[\[[\w\s\d\|]+?\]\]/g;
            linksarray = text.match(linkregex);
            linksarray = linksarray
                .map(title => title.replace(/\[\[|\]\]/g, ''))
                .map(title => title.split('|'));

            return linksarray;
        } catch (error) {
            console.warn(`getCleanLinks: ${error}, retry`);
            throw error;
        }
    }

}

async function getHTMLbyName(title, lang) {
    while (true) {
        const request = `https://${lang}.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(title)}&formatversion=2`;
        try {
            response = await fetch(request);
            const data = await response.json();
            let text = data.parse.text;
            text = cleanHTML(text);
            text = replaceLinks(text);
            text = `<h1>${title}</h1>` + text;

            return text;
        } catch (error) {
            console.warn(`getHTMLbyName: ${error}, retry`);
            throw error;
        }
    }
}

function cleanHTML(html) {
    const ch = cheerio.load(html);
    ch('.mw-editsection').remove();
    ch('.navbox').remove();
    ch('.ambox').remove();
    ch('.mbox-text').remove();
    ch('.asbox').remove();
    let result = ch.html();

    return result;
}

function replaceLinks(html) {
    const ch = cheerio.load(html);
    ch('a[href^="/wiki/"]').each(function () {
        if (ch(this).text()) {
            const text = ch(this).text();
            const href = ch(this).attr('href').replace(/\/wiki\//, '');
            const replacement = `<span class="gamelink" linkto=${decodeURIComponent(href)}> ${text} </span>`;
            ch(this).replaceWith(replacement);
        }
    })
    ch('a').each(function () {
        console.log(ch(this));
        console.log(ch(this).attr('href'));
        if (ch(this).text() && !ch(this).attr('href').startsWith('#')) {
            const text = ch(this).text();
            ch(this).replaceWith(text);
        }
    })

    return ch.html();
}

async function createGame(lang, startForHost = null, startForGuest = null) {
    const game = new Gamestate(lang, startForHost, startForGuest);
    await game.init(startForHost, startForGuest);
    return game;
}


async function runTest() {
    try {
        const game = await createGame('ru', 'Кикиморино', 'Московское время'); //'Кикиморино', 'Московское время'
        console.log('Initial game state:', game);

        await game.getNext(true, game.hostLink.links[0].title);
        await game.getNext(false, game.guestLink.links[11].title)
        console.log('After getNext:', game);

        if (game.checkForMatch()) console.log('worked');
        return game;
    } catch (error) {
        console.error('Error:', error);
    }
}

module.exports = {
    Gamestate,
    createGame
};

