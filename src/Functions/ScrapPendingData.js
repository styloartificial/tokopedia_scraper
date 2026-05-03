const Helper = require("../Helpers/Helper");
const ProductRecommender = require("../Helpers/ProductRecommender");

class ScrapPendingData {
    constructor(page, config) {
        this.page = page;
        this.config = config;
    }

    parsePrice(priceStr) {
        if (!priceStr) return null;
        const cleaned = priceStr.replace(/[^0-9]/g, "");
        const value = parseInt(cleaned, 10);
        return isNaN(value) ? null : value;
    }

    parseTotalBuy(totalBuyStr) {
        if (!totalBuyStr) return null;

        const lower = totalBuyStr.toLowerCase().replace(/\s/g, "");

        let multiplier = 1;
        let numStr = lower;

        if (lower.includes("jt")) {
            multiplier = 1_000_000;
            numStr = lower.replace("jt", "").replace("+", "").replace("terjual", "");
        } else if (lower.includes("rb")) {
            multiplier = 1_000;
            numStr = lower.replace("rb", "").replace("+", "").replace("terjual", "");
        } else {
            numStr = lower.replace("+", "").replace("terjual", "");
        }

        // Handle koma desimal, misal "1,5"
        numStr = numStr.replace(",", ".");

        const value = parseFloat(numStr);
        return isNaN(value) ? null : Math.floor(value * multiplier);
    }

    async run(pendingData) {
        try {
            const isArrayOfString = Array.isArray(pendingData) && pendingData.every(item => typeof item === 'string');
            if (!isArrayOfString) return;

            const storedData = [];

            for (const data of pendingData) {
                Helper.PrintMsg(`Scraping data for: ${data}`);

                // 1. Navigasi ke halaman search Tokopedia
                await this.page.goto(`https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(data)}`, {
                    waitUntil: 'load',
                });

                // 2. Tunggu container produk muncul
                await this.page.waitForSelector('[data-testid="divSRPContentProducts"]', { timeout: 10000 });

                // 3. Ambil 10 data produk teratas
                const rawProducts = await this.page.evaluate(() => {
                    const container = document.querySelector('[data-testid="divSRPContentProducts"]');
                    if (!container) return [];

                    // Ambil semua card produk (tag <a> yang punya href tokopedia)
                    const cards = Array.from(container.querySelectorAll('a[href*="tokopedia.com"]')).slice(0, 10);
                    if (!cards.length) return [];

                    return cards.map(card => {
                        const allSpans = card.querySelectorAll('span');

                        // img_url
                        const imgEl = card.querySelector('img[alt="product-image"]');
                        const img_url = imgEl ? imgEl.src : null;

                        // link_url
                        const link_url = card.href || null;

                        // name → span pertama yang punya teks lebih dari 10 karakter
                        let name = null;
                        for (const span of allSpans) {
                            if (span.innerText && span.innerText.trim().length > 10) {
                                name = span.innerText.trim();
                                break;
                            }
                        }

                        // price → span yang teksnya diawali "Rp"
                        let price = null;
                        for (const span of allSpans) {
                            const text = span.innerText?.trim();
                            if (text && text.startsWith('Rp') && !text.includes(' ')) {
                                price = text;
                                break;
                            }
                        }

                        // rating → span yang isinya angka desimal antara 1.0 - 5.0
                        let rating = null;
                        for (const span of allSpans) {
                            const text = span.innerText?.trim();
                            if (text && /^[1-5](\.[0-9])?$/.test(text)) {
                                rating = text;
                                break;
                            }
                        }

                        // total_buy → span yang mengandung kata "terjual"
                        let total_buy = null;
                        for (const span of allSpans) {
                            const text = span.innerText?.trim();
                            if (text && text.toLowerCase().includes('terjual')) {
                                total_buy = text;
                                break;
                            }
                        }

                        return { name, price, total_buy, rating, img_url, link_url };
                    });
                });

                if (!rawProducts.length) {
                    Helper.PrintErrorMsg(`No products found for: ${data}`);
                    continue;
                }

                Helper.PrintMsg(`Found ${rawProducts.length} products for: ${data}`);

                // 4. Filter produk yang field pentingnya tidak null, lalu parse ke number
                const validProducts = rawProducts
                    .map(item => ({
                        ...item,
                        _parsedPrice: this.parsePrice(item.price),
                        _parsedTotalBuy: this.parseTotalBuy(item.total_buy),
                        _parsedRating: item.rating ? parseFloat(item.rating) : null,
                    }))
                    .filter(item =>
                        item._parsedPrice !== null &&
                        item._parsedTotalBuy !== null &&
                        item._parsedRating !== null
                    );

                if (!validProducts.length) {
                    Helper.PrintErrorMsg(`No valid products after filtering for: ${data}`);
                    continue;
                }

                // 5. Siapkan data untuk ProductRecommender
                const productsForRecommender = validProducts.map(item => ({
                    price: item._parsedPrice,
                    rating: item._parsedRating,
                    total_buy: item._parsedTotalBuy,
                }));

                // 6. Dapatkan rekomendasi terbaik
                const productRecommendation = ProductRecommender.getBest(productsForRecommender);

                // 7. Ambil data asli berdasarkan index rekomendasi
                const bestProduct = validProducts[productRecommendation.index];

                Helper.PrintMsg(`Best product for "${data}": ${bestProduct.name} (score: ${productRecommendation.score.toFixed(4)})`);

                storedData.push({
                    name: bestProduct.name,
                    price: bestProduct.price,
                    total_buy: bestProduct.total_buy,
                    rating: bestProduct.rating,
                    img_url: bestProduct.img_url,
                    link_url: bestProduct.link_url,
                });
            }

            await this.page.goto(this.config.pageUrl, {
                waitUntil: 'load',
            });

            try {
                Helper.PrintMsg("Storing scraped data to Firebase...");
                const DoneTicketRequestInstance = new SetDoneTicketRequest(this.page, this.config, pendingData.ticket_id, storedData);
                await DoneTicketRequestInstance.run();
                Helper.PrintMsg("Data stored to Firebase successfully.");
            } catch (error) {
                Helper.PrintErrorMsg(`Failed to store data to Firebase.`);
            }

            return storedData;

        } catch (error) {
            Helper.PrintErrorMsg(`Failed to scrap pending data: ${error.message}`);
            throw error;
        }
    }
}

module.exports = ScrapPendingData;