const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const DOMAIN = 'https://yanhh3d.ee';
const PORT = process.env.PORT || 7000;

const http = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': DOMAIN
    },
    timeout: 10000
});

// Manifest bắt buộc phải có "catalogs: []" để không bị lỗi Linter
const manifest = {
    id: "org.nuvio.yanhh3d",
    version: "1.0.0",
    name: "Yanhh3d - Hoạt Hình 3D",
    description: "Nguồn phát Hoạt Hình 3D Trung Quốc từ yanhh3d.ee",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

async function getStreamFromYanhh3d(imdbId, season, episode) {
    try {
        const imdbRes = await http.get(`https://v2.sg.media-imdb.com/suggestion/${imdbId[0]}/${imdbId}.json`);
        if (!imdbRes.data?.d?.[0]) return null;

        const title = imdbRes.data.d[0].l;

        const searchUrl = `${DOMAIN}/?s=${encodeURIComponent(title)}`;
        const searchRes = await http.get(searchUrl);
        const $search = cheerio.load(searchRes.data);

        const movieLink = $search('article.item-s a').first().attr('href') || $search('.halim-item a').first().attr('href');
        if (!movieLink) return null;

        let targetEpisodeUrl = movieLink;
        if (episode) {
            targetEpisodeUrl = `${movieLink.replace(/\/$/, '')}-tap-${episode}`;
        }

        const epRes = await http.get(targetEpisodeUrl);
        const $ep = cheerio.load(epRes.data);

        let streamUrl = $ep('iframe').attr('src') || $ep('#player-embed iframe').attr('src');

        if (streamUrl && streamUrl.startsWith('//')) {
            streamUrl = 'https:' + streamUrl;
        }

        return streamUrl;
    } catch (err) {
        return null;
    }
}

builder.defineStreamHandler(async ({ type, id }) => {
    const [imdbId, season, episode] = id.split(':');
    const streamUrl = await getStreamFromYanhh3d(imdbId, season, episode);

    if (streamUrl) {
        return {
            streams: [
                {
                    title: `Yanhh3d - Tập ${episode || 1} [Vietsub]`,
                    url: streamUrl
                }
            ]
        };
    }

    return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: PORT });
