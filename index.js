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

// Bổ sung "meta" vào danh sách resources
const manifest = {
    id: "org.nuvio.yanhh3d",
    version: "1.0.3",
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

// 1. Quét danh mục phim trang chủ
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

                if (img && img.includes(' ')) {
                    img = img.split(' ')[0];
                }

                const isExcluded = link.includes('/category/') || link.includes('/tag/') || link.includes('/page/') || link === DOMAIN || link === `${DOMAIN}/`;

                if (title && title.length > 2 && img && !isExcluded) {
                    addedLinks.add(link);

                    let posterUrl = img;
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
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// 2. Xử lý thông tin chi tiết từng phim (Bắt buộc phải có để Nuvio mở trang thông tin phim)
builder.defineMetaHandler(async ({ type, id }) => {
    if (id.startsWith('yanhh3d_')) {
        const targetUrl = decodeURIComponent(id.replace('yanhh3d_', ''));
        try {
            const res = await http.get(targetUrl);
            const $ = cheerio.load(res.data);

            const title = $('h1.entry-title, .post-title, h1').first().text().trim() || "Hoạt Hình 3D";
            const imgEl = $('.poster img, .entry-content img, article img').first();
            let img = imgEl.attr('src') || imgEl.attr('data-src');

            if (img && img.startsWith('//')) {
                img = 'https:' + img;
            }

            return {
                meta: {
                    id: id,
                    type: 'series',
                    name: title,
                    poster: img,
                    description: `Xem ${title} Vietsub chất lượng cao tại Yanhh3d.`
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

// 3. Lấy link video để phát
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
    
