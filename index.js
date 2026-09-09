const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const DOMAIN = 'https://tram3d.my';
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
    id: "org.nuvio.tram3d",
    version: "1.1.0",
    name: "Tram3D - Hoạt Hình 3D",
    description: "Nguồn phát Hoạt Hình 3D Thuyết Minh & Vietsub từ tram3d.my",
    resources: ["catalog", "meta", "stream"],
    types: ["series", "movie"],
    idPrefixes: ["tram3d_"],
    catalogs: [
        {
            type: "series",
            id: "tram3d_catalog",
            name: "Tram3D - Phim Mới Cập Nhật"
        }
    ]
};

const builder = new addonBuilder(manifest);

// 1. Catalog Handler - Danh mục phim từ Tram3D
builder.defineCatalogHandler(async ({ type, id }) => {
    if (type === 'series' && id === 'tram3d_catalog') {
        try {
            const res = await http.get(DOMAIN);
            const $ = cheerio.load(res.data);
            const metas = [];
            const addedLinks = new Set();

            $('a').each((i, el) => {
                let link = $(el).attr('href');
                if (!link) return;

                if (!link.startsWith('http')) {
                    link = DOMAIN + (link.startsWith('/') ? '' : '/') + link;
                }

                if (!link.includes('tram3d.my') || addedLinks.has(link)) return;

                const title = $(el).attr('title') || $(el).find('img').attr('alt') || $(el).text().trim();
                const imgEl = $(el).find('img').first();
                let img = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('srcset');

                if (img && img.includes(' ')) img = img.split(' ')[0];

                const isExcluded = link.includes('/category/') || link.includes('/tag/') || link.includes('/page/') || link === DOMAIN || link === `${DOMAIN}/`;

                if (title && title.length > 2 && img && !isExcluded) {
                    addedLinks.add(link);
                    let posterUrl = img.startsWith('//') ? 'https:' + img : img;
                    if (!posterUrl.startsWith('http')) posterUrl = DOMAIN + posterUrl;

                    metas.push({
                        id: 'tram3d_' + encodeURIComponent(link),
                        type: 'series',
                        name: title,
                        poster: posterUrl,
                        description: `Xem ${title} Thuyết Minh / Vietsub tại Tram3D`
                    });
                }
            });

            return { metas };
        } catch (err) {
            console.error("Lỗi Catalog Tram3D:", err.message);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// 2. Meta Handler - Danh sách Tập & Poster
builder.defineMetaHandler(async ({ type, id }) => {
    if (id.startsWith('tram3d_')) {
        const targetUrl = decodeURIComponent(id.replace('tram3d_', ''));
        try {
            const res = await http.get(targetUrl);
            const $ = cheerio.load(res.data);

            const title = $('h1.entry-title, .post-title, h1, .title').first().text().trim() || "Hoạt Hình 3D";
            const imgEl = $('.poster img, .entry-content img, article img, .halim-thumb img, .film-info img').first();
            let poster = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src');

            if (poster) {
                if (poster.startsWith('//')) poster = 'https:' + poster;
                else if (!poster.startsWith('http')) poster = DOMAIN + poster;
            }

            const videos = [];
            const addedEps = new Set();

            // Bóc tách danh sách tập phim
            $('a').each((i, el) => {
                let epLink = $(el).attr('href');
                const epText = $(el).text().trim();

                if (epLink) {
                    if (!epLink.startsWith('http')) {
                        epLink = DOMAIN + (epLink.startsWith('/') ? '' : '/') + epLink;
                    }

                    if (epLink.includes('tram3d.my') && !addedEps.has(epLink)) {
                        const isEpUrl = /\/tap-\d+/i.test(epLink) || /tập\s*\d+/i.test(epText) || /ep\s*\d+/i.test(epText);
                        
                        if (isEpUrl) {
                            addedEps.add(epLink);
                            const match = epText.match(/\d+/) || epLink.match(/tap-(\d+)/i);
                            const epNum = match ? parseInt(match[1] || match[0], 10) : (videos.length + 1);

                            videos.push({
                                id: 'tram3d_' + encodeURIComponent(epLink),
                                title: `Tập ${epNum}`,
                                season: 1,
                                episode: epNum,
                                thumbnail: poster,
                                released: new Date().toISOString()
                            });
                        }
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
                    description: `Xem ${title} Thuyết Minh chất lượng cao tại Tram3D.`,
                    videos: videos
                }
            };
        } catch (err) {
            console.error("Lỗi Meta Tram3D:", err.message);
            return {
                meta: { id: id, type: 'series', name: "Tram3D Donghua", description: "Chi tiết phim Tram3D" }
            };
        }
    }
    return { meta: null };
});

// Hàm hỗ trợ bóc tách link video gốc .m3u8 / .mp4
async function resolveDirectMediaUrl(embedUrl) {
    try {
        const response = await http.get(embedUrl, {
            headers: { 'Referer': DOMAIN }
        });
        const html = response.data;

        const match = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i) || 
                      html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/i) ||
                      html.match(/file:\s*["'](https?:\/\/[^"'\s]+)["']/i);

        if (match && match[1]) {
            return match[1];
        }
    } catch (e) {
        console.error("Lỗi resolve link media:", e.message);
    }
    return embedUrl;
}

// 3. Stream Handler - Quét đầy đủ các Server (Thuyết Minh / Vietsub)
builder.defineStreamHandler(async ({ type, id }) => {
    if (!id.startsWith('tram3d_')) return { streams: [] };

    const targetUrl = decodeURIComponent(id.replace('tram3d_', ''));

    try {
        const epRes = await http.get(targetUrl);
        const $ep = cheerio.load(epRes.data);
        const streams = [];
        const embedUrls = [];

        // 1. Tìm các thẻ iframe phát trực tiếp
        $ep('iframe').each((i, el) => {
            let src = $ep(el).attr('src') || $ep(el).attr('data-src');
            if (src) {
                if (src.startsWith('//')) src = 'https:' + src;
                const name = $ep(el).parent().text().trim() || `Server ${i + 1}`;
                embedUrls.push({ name: name, url: src });
            }
        });

        // 2. Tìm danh sách các nút chọn Server Thuyết Minh / Vietsub / Dự Phòng
        $ep('.server-item, .halim-server-item, .btn-episode, [data-embed], .sv-item').each((i, el) => {
            let link = $ep(el).attr('data-embed') || $ep(el).attr('data-link') || $ep(el).attr('href');
            let name = $ep(el).text().trim() || `Server ${i + 1}`;

            if (link) {
                if (link.startsWith('//')) link = 'https:' + link;
                else if (!link.startsWith('http')) link = DOMAIN + (link.startsWith('/') ? '' : '/') + link;
                embedUrls.push({ name: name, url: link });
            }
        });

        // 3. Trích xuất nguồn video và gán Headers cho Nuvio
        for (let idx = 0; idx < embedUrls.length; idx++) {
            const item = embedUrls[idx];
            const directUrl = await resolveDirectMediaUrl(item.url);

            let serverTitle = item.name.length > 1 ? item.name : `Server ${idx + 1}`;

            streams.push({
                name: "Tram3D",
                title: `${serverTitle}`,
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
        console.error("Lỗi lấy Stream Tram3D:", err.message);
    }

    return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: PORT });
                
