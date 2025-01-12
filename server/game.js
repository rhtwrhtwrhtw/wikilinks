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

            this.hostLink.links = await getCleanLinks(this.hostLink.title, this.lang);
            this.guestLink.links = await getCleanLinks(this.guestLink.title, this.lang);

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
                    this.hostLink.links = await getCleanLinks(this.hostLink.title, this.lang);
                } else {
                    this.guestArray.push(article);
                    this.guestLink = article;
                    this.guestLink.links = await getCleanLinks(this.guestLink.title, this.lang);
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
            const text = data.parse.text;

            return cleanHTML(text);
        } catch (error) {
            console.warn(`getHTMLbyName: ${error}, retry`);
            throw error;
        }
    }
}

function cleanHTML(html) {
    const ch = cheerio.load(html);
    ch('.mw-editsection').remove();
    let result = ch.html();

    result = result.replace(/(<a.+?>|<\/a>)/g, '');

    return result;
}

async function combinedArticle(name, lang) {
    let article = await getHTMLbyName(name, lang);
    const links = await getCleanLinks(name, lang);

    currentPosition = 0; 
    while (links.length > 0) {
        const currentLink = links[0];
        if (currentLink.length === 1) {
           const pos = article.indexOf(currentLink); 
           article = article.slice(0,pos) + '<span class="gamelink">' + currentLink + '</span>' + article.slice(pos+currentLink[0].length, article.length);
        }
        if (currentLink.length === 2) {
           
        }
        links.shift();
    }

    return article;
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

getHTMLbyName('Bureya_Range', "en").then(
    //output => console.log(output)
)

getCleanLinks('Bureya_Range', "en").then(
    //output => console.log(output)
)


combinedArticle('Russian_Far_East', 'en').then(
    output => console.log(output)
)

module.exports = {
    Gamestate,
    createGame
};

