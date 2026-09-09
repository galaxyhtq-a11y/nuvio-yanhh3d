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

const manifest = {
    id: "org.nuvio.yanhh3d",
    version: "1.0.5",
    name: "Yanhh3d - Hoạt Hình 3D",
    description: "Nguồn phát Hoạt Hình 3D Trung Quốc từ yanhh3d.ee",
    resources: ["catalog", "meta", "stream"],
    types: ["series", "movie"],
    idPrefixes: ["yanhh3d_"],
    catalogs: [
        {
            type: "series",
            id: "yanhh3d_catalog",
            name: "Yanhh3d - Phim Mới Cập Nhật"
        }
    ]
};

const builder = new addonBuilder(manifest);

// 1. Catalog Handler
builder.defineCatalogHandler(async ({ type, id }) => {
    if (type === 'series' && id === 'yanhh3d_catalog') {
        try {
            const res = await http.get(DOMAIN);
            const $ = cheerio.load(res.data);
            const metas = [];
            const addedLinks = new Set();

            $('a').each((i, el) => {
                const link = $(el).attr('href');
                if (!link || !link.startsWith(DOMAIN) || addedLinks.has(link)) return;

                const title = $(el).attr('title') || $(el).find('img').attr('alt') || $(el).text().trim();
                const imgEl = $(el).find('img').first();
                let img = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('srcset');

                if (img && img.includes(' ')) img = img.split(' ')[0];

                const isExcluded = link.includes('/category/') || link.includes('/tag/') || link.includes('/page/') || link === DOMAIN || link === `${DOMAIN}/`;

                if (title && title.length > 2 && img && !isExcluded) {
                    addedLinks.add(link);
                    let posterUrl = img.startsWith('//') ? 'https:' + img : img;

                    metas.push({
                        id: 'yanhh3d_' + encodeURIComponent(link),
                        type: 'series',
                        name: title,
                        poster: posterUrl,
                        description: `Xem ${title} Vietsub trên Yanhh3d`
                    });
                }
            });

            return { metas };
        } catch (err) {
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// 2. Meta Handler - Quét triệt để danh sách tập và hình ảnh
builder.defineMetaHandler(async ({ type, id }) => {
    if (id.startsWith('yanhh3d_')) {
        const targetUrl = decodeURIComponent(id.replace('yanhh3d_', ''));
        try {
            const res = await http.get(targetUrl);
            const $ = cheerio.load(res.data);

            const title = $('h1.entry-title, .post-title, h1').first().text().trim() || "Hoạt Hình 3D";
            const imgEl = $('.poster img, .entry-content img, article img, .halim-thumb img').first();
            let poster = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src');

            if (poster && poster.startsWith('//')) {
                poster = 'https:' + poster;
            }

            const videos = [];
            const addedEps = new Set();

            // Quét tất cả thẻ a có khả năng là liên kết tập phim
            $('a').each((i, el) => {
                const epLink = $(el).attr('href');
                const epText = $(el).text().trim();

                if (epLink && epLink.startsWith(DOMAIN) && !addedEps.has(epLink)) {
                    // Kiểm tra nếu text hoặc đường dẫn có chứa dấu hiệu của tập (tap-1, tap-2, hoặc chữ Tập X)
                    const isEpUrl = /\/tap-\d+/i.test(epLink) || /tập\s*\d+/i.test(epText) || /ep\s*\d+/i.test(epText);
                    
                    if (isEpUrl) {
                        addedEps.add(epLink);
                        const match = epText.match(/\d+/) || epLink.match(/tap-(\d+)/i);
                        const epNum = match ? parseInt(match[1] || match[0], 10) : (videos.length + 1);

                        videos.push({
                            id: 'yanhh3d_' + encodeURIComponent(epLink),
                            title: `Tập ${epNum}`,
                            season: 1,
                            episode: epNum,
                            thumbnail: poster, // Gán poster phim làm hình đại diện cho tập
                            released: new Date().toISOString()
                        });
                    }
                }
            });

            // Trường hợp phim lẻ hoặc trang hiện tại chính là 1 tập phim
            if (videos.length === 0) {
                videos.push({
                    id: id,
                    title: 'Tập 1',
                    season: 1,
                    episode: 1,
                    thumbnail: poster
                });
            } else {
                videos.sort((a, b) => a.episode - b.episode);
            }

            return {
                meta: {
                    id: id,
                    type: 'series',
                    name: title,
                    poster: poster,
                    background: poster,
                    description: `Xem ${title} Vietsub chất lượng cao tại Yanhh3d.`,
                    videos: videos
                }
            };
        } catch (err) {
            return {
                meta: {
                    id: id,
                    type: 'series',
                    name: "Yanhh3d Movie",
                    description: "Chi tiết phim Yanhh3d"
                }
            };
        }
    }
    return { meta: null };
});

// 3. Stream Handler
builder.defineStreamHandler(async ({ type, id }) => {
    if (!id.startsWith('yanhh3d_')) return { streams: [] };

    const targetUrl = decodeURIComponent(id.replace('yanhh3d_', ''));

    try {
        const epRes = await http.get(targetUrl);
        const $ep = cheerio.load(epRes.data);

        let streamUrl = $ep('iframe').attr('src') || $ep('#player-embed iframe').attr('src') || $ep('.watch-player iframe').attr('src');

        if (streamUrl && streamUrl.startsWith('//')) {
            streamUrl = 'https:' + streamUrl;
        }

        if (streamUrl) {
            return {
                streams: [
                    {
                        title: `Yanhh3d - Server Vietsub`,
                        url: streamUrl
                    }
                ]
            };
        }
    } catch (err) {
        console.error("Lỗi lấy stream:", err.message);
    }

    return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: PORT });
