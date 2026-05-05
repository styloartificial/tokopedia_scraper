const Helper = require("../Helpers/Helper");
const ProductRecommender = require("../Helpers/ProductRecommender");
const SetDoneTicketRequest = require("../Functions/SetDoneTicketRequest")

class ScrapPendingData {
    constructor(page, config, scraperInstances = []) {
        this.page = page;
        this.config = config;
        this.scraperInstances = scraperInstances;
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

    async ensureTokopediaReady(page) {
        const searchInputSelector = 'input[type="search"][data-unify="Search"][aria-label="Cari di Tokopedia"]';
        try {
            await page.waitForSelector(searchInputSelector, { timeout: 5000 });
            return searchInputSelector;
        } catch (_) {
            await page.goto('https://www.tokopedia.com', { waitUntil: 'domcontentloaded' });
            await page.waitForSelector(searchInputSelector, { timeout: 30000 });
            return searchInputSelector;
        }
    }

    async scrapeKeywordWithPage(page, keyword, windowIndex) {
        try {
            Helper.PrintMsg(`[Window ${windowIndex}] Scraping data for: ${keyword}`);

            const searchInputSelector = await this.ensureTokopediaReady(page);

            await page.fill(searchInputSelector, '');
            await page.click(searchInputSelector);
            await page.type(searchInputSelector, keyword, { delay: 30 });
            await page.keyboard.press('Enter');

            try {
                await page.waitForURL(/\/search\?/, { timeout: 15000 });
            } catch (_) {
            }

            await page.waitForSelector('[data-testid="divSRPContentProducts"]', { timeout: 30000 });

            const rawProducts = await page.evaluate(() => {
                const container = document.querySelector('[data-testid="divSRPContentProducts"]');
                if (!container) return [];

                const cards = Array.from(container.querySelectorAll('a[href*="tokopedia.com"]')).slice(0, 10);
                if (!cards.length) return [];

                return cards.map(card => {
                    const allSpans = card.querySelectorAll('span');

                    const imgEl = card.querySelector('img[alt="product-image"]');
                    const img_url = imgEl ? imgEl.src : null;

                    const link_url = card.href || null;

                    let name = null;
                    for (const span of allSpans) {
                        if (span.innerText && span.innerText.trim().length > 10) {
                            name = span.innerText.trim();
                            break;
                        }
                    }

                    let price = null;
                    for (const span of allSpans) {
                        const text = span.innerText?.trim();
                        if (text && text.startsWith('Rp') && !text.includes(' ')) {
                            price = text;
                            break;
                        }
                    }

                    let rating = null;
                    for (const span of allSpans) {
                        const text = span.innerText?.trim();
                        if (text && /^[1-5](\.[0-9])?$/.test(text)) {
                            rating = text;
                            break;
                        }
                    }

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
                Helper.PrintErrorMsg(`No products found for: ${keyword}`);
                return null;
            }

            Helper.PrintMsg(`Found ${rawProducts.length} products for: ${keyword}`);

            const validProducts = rawProducts
                .map(item => ({
                    ...item,
                    _parsedPrice: this.parsePrice(item.price),
                    _parsedTotalBuy: this.parseTotalBuy(item.total_buy) ?? 0,
                    _parsedRating: item.rating ? parseFloat(item.rating) : 0,
                }))
                .filter(item => item._parsedPrice !== null);

            if (!validProducts.length) {
                Helper.PrintErrorMsg(`No valid products after filtering for: ${keyword}, using first raw product as fallback`);
                const fallback = rawProducts[0];
                return {
                    name: fallback.name,
                    price: fallback.price,
                    total_buy: fallback.total_buy,
                    rating: fallback.rating,
                    img_url: fallback.img_url,
                    link_url: fallback.link_url,
                };
            }

            const productsForRecommender = validProducts.map(item => ({
                price: item._parsedPrice,
                rating: item._parsedRating,
                total_buy: item._parsedTotalBuy,
            }));

            const productRecommendation = ProductRecommender.getBest(productsForRecommender);
            const bestProduct = validProducts[productRecommendation.index];

            Helper.PrintMsg(`Best product for "${keyword}": ${bestProduct.name} (score: ${productRecommendation.score.toFixed(4)})`);

            return {
                name: bestProduct.name,
                price: bestProduct.price,
                total_buy: bestProduct.total_buy,
                rating: bestProduct.rating,
                img_url: bestProduct.img_url,
                link_url: bestProduct.link_url,
            };
        } catch (err) {
            Helper.PrintErrorMsg(`Error scraping "${keyword}": ${err.message}`);
            return null;
        }
    }

    async run(pendingData, ticketId) {
        try {
            const isArrayOfString = Array.isArray(pendingData) && pendingData.every(item => typeof item === 'string');
            if (!isArrayOfString) return;

            const scraperInstances = Array.isArray(this.scraperInstances) ? this.scraperInstances : [];
            if (!scraperInstances.length) {
                Helper.PrintErrorMsg("No scraper instances available.");
                return [];
            }

            const workerCount = Math.min(scraperInstances.length, pendingData.length);
            Helper.PrintMsg(`Processing ${pendingData.length} keywords with ${workerCount} scraper windows...`);

            const results = new Array(pendingData.length).fill(null);
            let nextIndex = 0;

            const worker = async (workerIndex) => {
                const page = scraperInstances[workerIndex].page;
                while (true) {
                    const current = nextIndex;
                    nextIndex += 1;
                    if (current >= pendingData.length) break;

                    const keyword = pendingData[current];
                    results[current] = await this.scrapeKeywordWithPage(page, keyword, workerIndex);
                }
            };

            await Promise.all(Array.from({ length: workerCount }, (_, idx) => worker(idx)));

            const storedData = results.filter(Boolean);

            try {
                Helper.PrintMsg("Storing scraped data to Firebase...");
                const DoneTicketRequestInstance = new SetDoneTicketRequest(this.page, this.config, ticketId, storedData);
                await DoneTicketRequestInstance.run();
                Helper.PrintMsg("Data stored to Firebase successfully.");
            } catch (error) {
                Helper.PrintErrorMsg(`Failed to store data to Firebase: ${error.message}`);
            }

            return storedData;

        } catch (error) {
            Helper.PrintErrorMsg(`Failed to scrap pending data: ${error.message}`);
            throw error;
        }
    }
}

module.exports = ScrapPendingData;
