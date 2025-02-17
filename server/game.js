const cheerio = require('cheerio');

class Gamestate {
    constructor(lang, artforhost, artforguest, logger) {
        this.lang = lang;
        this.startForHost = artforhost.match(/wikipedia\.org\/wiki\/(.+?)(?:\?|#|$)/)?.[1];
        this.startForGuest = artforguest.match(/wikipedia\.org\/wiki\/(.+?)(?:\?|#|$)/)?.[1];
        this.hostLink = null;
        this.guestLink = null;
        this.hostArray = [];
        this.guestArray = [];
        this.hostNext = null;
        this.guestNext = null;
        this.isReady = false;

        this.logger = logger;
    }

    async init() {
        this.logger.write(`Init called with lang ${this.lang}, prechosen links:`, this.startForHost, this.startForGuest);
        try {
            this.hostLink = (this.startForHost !== undefined) ? await getByName(this.startForHost, this.lang, this.logger) : await getAGoodOne(this.lang, this.logger);
            this.guestLink = (this.startForGuest !== undefined) ? await getByName(this.startForGuest, this.lang, this.logger) : await getAGoodOne(this.lang, this.logger);
            this.hostArray = [this.hostLink];
            this.guestArray = [this.guestLink];

            this.hostLink.links = await getHTMLbyName(this.hostLink.title, this.lang, this.logger);
            this.guestLink.links = await getHTMLbyName(this.guestLink.title, this.lang, this.logger);

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
                    if (!this.hostArray.some(a => a.title === article.title)) {
                        this.hostArray.push(article);
                    }   
                    this.hostLink = article;
                    this.hostLink.links = await getHTMLbyName(this.hostLink.title, this.lang, this.logger);
                } else {
                    if (!this.guestArray.some(a => a.title === article.title)) {
                        this.guestArray.push(article);
                    }                    
                    this.guestLink = article;
                    this.guestLink.links = await getHTMLbyName(this.guestLink.title, this.lang, this.logger);
                }
                break;
            } catch (error) {
                this.logger.write(`error in getNext: ${error}`);
                throw error;
            }
        }
    }
}

async function randomArticles(lang, logger, n, linkN) {
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
    } catch (error) { 
        logger.write(`randomArticles error: ${error}`);
        throw error;
    }
}

async function getAGoodOne(lang, logger, n = 8, linkN = 500) {
    let articles = []
    while (true) {
        try {
            articles = await randomArticles(lang, logger, n, linkN);
            break;
        } catch ({ name, message }) {
            if (name !== 'TypeError') {
                logger.write(`non typerror: ${message}`);
                break;
            }
            logger.write(`TypeError in getAGoodOne: ${message}, retry`);
        }
    }
    articles.filter(article => article.linksLength !== 0);
    articles = articles.sort((a, b) => b.linksLength - a.linksLength);
    return articles.shift();
}

async function getByName(name, lang, logger) {
    name = decodeURIComponent(name);
    logger.write(`getByName called with: ${name}, ${lang}`);
    while (true) {
        try {
            const request = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=links&list=&titles=${encodeURIComponent(name)}&formatversion=2&pllimit=500`;
            const response = await fetch(request);
            if (!response.ok) {
                throw new Error(`failed to fetch ${choice}: ${response.status}`);
            }
            const data = await response.json();
            const article = data.query.pages[0];

            return article;
        } catch (error) { 
            logger.write(`getByName error: ${error}`); 
            throw error;
        }
    }
}

async function getHTMLbyName(title, lang, logger) {
    title = decodeURIComponent(title);
    logger.write(`getHTMLbyName called with ${title}`)
    while (true) {
        const request = `https://${lang}.wikipedia.org/w/api.php?action=parse&format=json&page=${title}&formatversion=2`;
        try {
            response = await fetch(request);
            if (!response.ok) {
                throw new Error(`failed to fetch ${choice}: ${response.status}`);
            }
            const data = await response.json();
        
            let text = data.parse.text;
            text = cleanHTML(text);
            text = replaceLinks(text, lang);
            text = `<h1>${title}</h1>` + text;

            return text;
        } catch (error) {
            logger.write(`getHTMLbyName: ${error}, retry`);
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
    ch('.navbar').remove();
    let result = ch.html();

    return result;
}

function replaceLinks(html, lang) {
    const ch = cheerio.load(html);
    ch(`
        a[href^="/wiki/Special:"],
        a[href^="/wiki/Help:"],
        a[href^="/wiki/Category:"],
        a[href^="/wiki/Talk:"],
        a[href^="/wiki/User:"],
        a[href^="/wiki/Template:"],
        a[href^="/wiki/Portal:"],
        a[href^="/wiki/File:"],
        a[href^="/wiki/MediaWiki:"],
        a[href^="/wiki/Wikipedia:"],
        a[href^="/wiki/Module:"],
        a[href^="/wiki/TimedText:"],
        a[href^="/wiki/Draft:"],
        a[href^="/wiki/Book:"]
      `).each(function () {
        if (ch(this).text()) {
            const text = ch(this).text();
            ch(this).replaceWith(text);
        }
    });

    ch('a[href^="/wiki/"]').each(function () {
        if (ch(this).text()) {
            const text = ch(this).text();
            const href = ch(this).attr('href').replace(/\/wiki\//, '');
            const replacement = `<span class="gamelink" linkto=${decodeURIComponent(href)}> ${text} </span>`;
            ch(this).replaceWith(replacement);
        }
    })
    ch('a').each(function() {
        if (ch(this).text() && String(ch(this).attr('href'))[0] != '#') {
            const text = ch(this).text();
            ch(this).replaceWith(text);
        }
    })
    ch('a').each(function() {
        if (ch(this).children('img').length == 1) {
            ch(this).attr('href', '');
        }
    })

    return ch.html();
}

module.exports = {
    Gamestate
};

