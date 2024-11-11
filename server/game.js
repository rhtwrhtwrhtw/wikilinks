class Gamestate {
    constructor(lang) {
        this.lang = lang;
        this.hostLink = null;
        this.guestLink = null;
        this.hostArray = [];
        this.guestArray = [];
        this.isReady = false;
    }

    async init(startForHost = null, startForGuest = null) {
        console.log(`Init called with lang ${this.lang}, starts:`, startForHost, startForGuest);
        try {
            this.hostLink = (startForHost != null) ? await getByName(startForHost, this.lang) : await getAGoodOne(this.lang);
            this.guestLink = (startForGuest != null) ? await getByName(startForGuest, this.lang) : await getAGoodOne(this.lang);
            this.hostArray = [this.hostLink];
            this.guestArray = [this.guestLink];
            
            this.isReady = true;
        } catch (error) {
            console.error('Failed to initialize game state:', error);
        }
    }

    async getNext(host, choice) {
        while (true) {
            try {
                if (!this.isReady) {
                    throw new Error("Game not initialized yet!");
                }

                const request = `https://${this.lang}.wikipedia.org/w/api.php?action=query&format=json&prop=links&list=&titles=${encodeURIComponent(choice)}&formatversion=2&pllimit=500`;
                const response = await fetch(request, { timeout: 30000 });
                if (!response.ok) {
                    throw new Error(`failed to fetch ${choice}: ${response.status}`);
                }
                const data = await response.json();
                const article = data.query.pages[0];

                if (host) {
                    this.hostArray.push(article);
                    this.hostLink = article;
                } else {
                    this.guestArray.push(article);
                    this.guestLink = article;
                }
                break;
            } catch (error) {
                console.log(`there is a ${error.name} that says ${error.message}`);
                throw error;
            }
        }
    }

    checkForMatch() {
        return this.hostLink.title === this.guestLink.title;
    }

    async test() {
        setTimeout(() => console.log('the thing worked'), 3000);
    }

}

async function randomArticles(lang, n, linkN) {
    try {
        const request = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=info%7Clinks%7Clinkshere&generator=random&formatversion=2&pllimit=${linkN}&lhlimit=${linkN}&grnlimit=${n}&grnnamespace=0`;
        const response = await fetch(request, { timeout: 30000 });
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

async function getAGoodOne(lang, n = 7, linkN = 500) {
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
            const response = await fetch(request, { timeout: 30000 });
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
 
(() => runTest()());


module.exports = {
    Gamestate,
    createGame
};
