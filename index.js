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
    version: "1.0.1",
    name: "Yanhh3d - Hoạt Hình 3D",
    description: "Nguồn phát Hoạt Hình 3D Trung Quốc từ yanhh3d.ee",
    resources: ["catalog", "stream"],
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

builder.defineCatalogHandler(async ({ type, id }) => {
    if (type === 'series' && id === 'yanhh3d_catalog') {
        try {
            const res = await http.get(DOMAIN);
            const $ = cheerio.load(res.data);
            const metas = [];

            // Quét các ô chứa phim trên yanhh3d
            $('article, .item-s, .halim-item, .post-item').each((i, el) => {
                const title = $(el).find('.entry-title, .halim-post-title, h2, h3').first().text().trim();
                const link = $(el).find('a').first().attr('href');
                
                // Tìm link ảnh từ nhiều thuộc tính khác nhau (lazy loading)
                const imgEl = $(el).find('img').first();
                let img = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('srcset');

                if (img && img.includes(' ')) {
                    img = img.split(' ')[0];
                }

                if (title && link) {
                    let posterUrl = img || '';
                    if (posterUrl.startsWith('//')) {
                        posterUrl = 'https:' + posterUrl;
                    }

                    const filmId = 'yanhh3d_' + encodeURIComponent(link);
                    metas.push({
                        id: filmId,
                        type: 'series',
                        name: title,
                        poster: posterUrl,
                        description: `Xem ${title} Vietsub trên Yanhh3d`
                    });
                }
            });

            return { metas };
        } catch (err) {
            console.error("Lỗi cào Catalog:", err.message);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

builder.defineStreamHandler(async ({ type, id }) => {
    let targetUrl = '';

    if (id.startsWith('yanhh3d_')) {
        targetUrl = decodeURIComponent(id.replace('yanhh3d_', ''));
    } else {
        return { streams: [] };
    }

    try {
        const epRes = await http.get(targetUrl);
        const $ep = cheerio.load(epRes.data);

        let streamUrl = $ep('iframe').attr('src') || $ep('#player-embed iframe').attr('src');

        if (streamUrl && streamUrl.startsWith('//')) {
            streamUrl = 'https:' + streamUrl;
        }

        if (streamUrl) {
            return {
                streams: [
                    {
                        title: `Yanhh3d - Bản chuẩn [Vietsub]`,
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
    
