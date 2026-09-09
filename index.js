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
    version: "1.0.4",
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

// 1. Catalog lấy danh sách phim
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

// 2. Meta Handler - Cào danh sách các tập phim để hiện nút chọn Tập
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

            const videos = [];
            
            // Cào các nút/link tập phim (dựa theo các lớp phổ biến như .halim-list-eps, .eps-list, a chứa chữ Tap)
            $('.halim-list-eps a, .list-episodes a, .eps-list a, .entry-content a').each((i, el) => {
                const epLink = $(el).attr('href');
                const epText = $(el).text().trim();

                // Lọc số tập từ tên nút (Ví dụ: "Tập 01", "1", "Tập 2")
                const epMatch = epText.match(/\d+/);
                if (epLink && epMatch) {
                    const epNum = parseInt(epMatch[0], 10);
                    const epId = 'yanhh3d_' + encodeURIComponent(epLink);

                    videos.push({
                        id: epId,
                        title: `Tập ${epNum}`,
                        season: 1,
                        episode: epNum,
                        released: new Date().toISOString()
                    });
                }
            });

            // Nếu không quét thấy các nút tập riêng lẻ, tạo mặc định Tập 1 dùng link hiện tại
            if (videos.length === 0) {
                videos.push({
                    id: id,
                    title: 'Tập 1',
                    season: 1,
                    episode: 1
                });
            } else {
                // Sắp xếp tập theo thứ tự tăng dần 1, 2, 3...
                videos.sort((a, b) => a.episode - b.episode);
            }

            return {
                meta: {
                    id: id,
                    type: 'series',
                    name: title,
                    poster: img,
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

// 3. Stream Handler - Trả về nguồn phát video tương ứng với Tập đã chọn
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
            
