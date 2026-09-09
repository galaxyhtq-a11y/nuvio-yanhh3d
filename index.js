const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const DOMAIN = 'https://yanhh3d.ee';
const PORT = process.env.PORT || 7000;

const http = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': DOMAIN,
        'Origin': DOMAIN
    },
    timeout: 10000
});

const manifest = {
    id: "org.nuvio.yanhh3d",
    version: "1.0.8",
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
                        description: `Xem ${title} Vietsub/Thuyết Minh trên Yanhh3d`
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

// 2. Meta Handler
builder.defineMetaHandler(async ({ type, id }) => {
    if (id.startsWith('yanhh3d_')) {
        const targetUrl = decodeURIComponent(id.replace('yanhh3d_', ''));
        try {
            const res = await http.get(targetUrl);
            const $ = cheerio.load(res.data);

            const title = $('h1.entry-title, .post-title, h1').first().text().trim() || "Hoạt Hình 3D";
            const imgEl = $('.poster img, .entry-content img, article img, .halim-thumb img').first();
            let poster = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src');

            if (poster && poster.startsWith('//')) poster = 'https:' + poster;

            const videos = [];
            const addedEps = new Set();

            $('a').each((i, el) => {
                const epLink = $(el).attr('href');
                const epText = $(el).text().trim();

                if (epLink && epLink.startsWith(DOMAIN) && !addedEps.has(epLink)) {
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
                            thumbnail: poster,
                            released: new Date().toISOString()
                        });
                    }
                }
            });

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
                    description: `Xem ${title} Vietsub & Thuyết Minh tại Yanhh3d.`,
                    videos: videos
                }
            };
        } catch (err) {
            return {
                meta: { id: id, type: 'series', name: "Yanhh3d Movie", description: "Chi tiết phim Yanhh3d" }
            };
        }
    }
    return { meta: null };
});

// Hàm hỗ trợ bóc tách link .m3u8 từ iframe hoặc player
async function resolveDirectMediaUrl(embedUrl) {
    try {
        const response = await http.get(embedUrl, {
            headers: { 'Referer': DOMAIN }
        });
        const html = response.data;

        // Trích xuất link .m3u8 / .mp4 bằng Regex trong Javascript code
        const m3u8Match = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i) || 
                          html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/i) ||
                          html.match(/file:\s*["'](https?:\/\/[^"'\s]+)["']/i);

        if (m3u8Match && m3u8Match[1]) {
            return m3u8Match[1];
        }
    } catch (e) {
        console.error("Lỗi resolve link:", e.message);
    }
    return embedUrl; // Trả về link gốc nếu không bóc tách được
}

// 3. Stream Handler - Tự động bóc tách link .m3u8 xem trực tiếp trên Nuvio
builder.defineStreamHandler(async ({ type, id }) => {
    if (!id.startsWith('yanhh3d_')) return { streams: [] };

    const targetUrl = decodeURIComponent(id.replace('yanhh3d_', ''));

    try {
        const epRes = await http.get(targetUrl);
        const $ep = cheerio.load(epRes.data);
        const streams = [];
        const embedUrls = [];

        // 1. Quét iframe chính và các Server dự phòng trong trang
        $ep('iframe').each((i, el) => {
            let src = $ep(el).attr('src') || $ep(el).attr('data-src');
            if (src) {
                if (src.startsWith('//')) src = 'https:' + src;
                const name = $ep(el).parent().text().trim() || `Server ${i + 1}`;
                embedUrls.push({ name: name, url: src });
            }
        });

        // 2. Quét các nút bấm chọn Server Thuyết minh / Vietsub
        $ep('.server-item, .halim-server-item, .btn-episode, [data-embed]').each((i, el) => {
            let link = $ep(el).attr('data-embed') || $ep(el).attr('data-link') || $ep(el).attr('href');
            let name = $ep(el).text().trim() || `Server ${i + 1}`;

            if (link && link.startsWith('http')) {
                embedUrls.push({ name: name, url: link });
            }
        });

        // 3. Bóc tách link .m3u8 trực tiếp cho từng Server
        for (let idx = 0; idx < embedUrls.length; idx++) {
            const item = embedUrls[idx];
            const directUrl = await resolveDirectMediaUrl(item.url);

            streams.push({
                name: "Yanhh3d",
                title: item.name.includes("Server") ? item.name : `Server ${idx + 1} (${item.name})`,
                url: directUrl,
                behaviorHints: {
                    notSupported: false,
                    requestHeaders: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Referer': DOMAIN,
                        'Origin': DOMAIN
                    }
                }
            });
        }

        return { streams };
    } catch (err) {
        console.error("Lỗi lấy stream:", err.message);
    }

    return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: PORT });
            
