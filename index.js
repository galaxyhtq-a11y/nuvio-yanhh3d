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

// 1. Khai báo Manifest có Catalog để hiện ở trang chính
const manifest = {
    id: "org.nuvio.yanhh3d",
    version: "1.0.0",
    name: "Yanhh3d - Hoạt Hình 3D",
    description: "Nguồn phát Hoạt Hình 3D Trung Quốc từ yanhh3d.ee",
    resources: ["catalog", "stream"], // Thêm "catalog" vào đây
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

// 2. Xử lý hiển thị danh sách phim ra trang chính
builder.defineCatalogHandler(async ({ type, id }) => {
    if (type === 'series' && id === 'yanhh3d_catalog') {
        try {
            const res = await http.get(DOMAIN);
            const $ = cheerio.load(res.data);
            const metas = [];

            // Cào danh sách phim trang chủ yanhh3d
            $('article.item-s, .halim-item').each((i, el) => {
                const title = $(el).find('.entry-title, .halim-post-title').text().trim();
                const link = $(el).find('a').first().attr('href');
                const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

                if (title && link) {
                    // Tạo ID riêng cho từng phim trên Yanhh3d
                    const filmId = 'yanhh3d_' + encodeURIComponent(link);
                    metas.push({
                        id: filmId,
                        type: 'series',
                        name: title,
                        poster: img && img.startsWith('//') ? 'https:' + img : img,
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

// 3. Xử lý lấy link phát video khi bấm vào phim
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
        
