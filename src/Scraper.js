const { chromium } = require('playwright-extra');
const Helper = require('./Helpers/Helper.js');
const path = require('path');
const GetFirebaseOldestPendingData = require('./Functions/GetFirebaseOldestPendingData.js');
const ScrapPendingData = require('./Functions/ScrapPendingData.js');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

class WebScraper {

    constructor(config = {}) {
        this.config = {
            headless: String(process.env.HEADLESS_MODE).toLowerCase() === 'true',
            pageUrl: process.env.PAGE_URL,
            loginId: process.env.LOGIN_ID,
            loginPassword: process.env.LOGIN_PASSWORD,
            loginPin: process.env.LOGIN_PIN,
            userDataDir: path.resolve(__dirname, './browser_session'),
            ...config
        };

        this.context = null;
        this.page = null;
        this.scraperInstances = [];
    }

    async checkProxyDetails() {
        try {
            Helper.PrintMsg("Checking Proxy...");

            const ipInfo = await this.page.evaluate(async () => {
                const response = await fetch('http://ip-api.com/json/');
                return await response.json();
            });

            if (ipInfo && ipInfo.status === 'success') {
                console.log(`\n🌐 === Proxy Details ===`);
                console.log(`IP Address : ${ipInfo.query}`);
                console.log(`Country    : ${ipInfo.country} (${ipInfo.countryCode})`);
                console.log(`City       : ${ipInfo.city}`);
                console.log(`ISP        : ${ipInfo.isp}`);
                console.log(`Timezone   : ${ipInfo.timezone}`);
                console.log(`================================\n`);
            } else {
                console.log("⚠️ Failed to get proxy IP details.");
            }
        } catch (error) {
            console.error("❌ Error while checking proxy:", error.message);
        }
    }

    async init() {
        const proxyConfig = process.env.PROXY_SERVER ? {
            server: process.env.PROXY_SERVER,
            username: process.env.PROXY_USERNAME,
            password: process.env.PROXY_PASSWORD
        } : undefined;

        this.context = await chromium.launchPersistentContext(this.config.userDataDir, {
            headless: this.config.headless,
            channel: 'chrome',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            // proxy: proxyConfig,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-infobars',
                '--window-size=1280,800',
            ],
        });

        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

        // Factory: buka scraper window baru on-demand saat ada pendingData
        this.launchScraperInstance = async (index) => {
            const instanceDir = path.resolve(this.config.userDataDir, `scraper_${index}`);
            const instanceContext = await chromium.launchPersistentContext(instanceDir, {
                headless: false,
                channel: 'chrome',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 800 },
                // proxy: proxyConfig,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-infobars',
                    '--window-size=1280,800',
                    `--window-position=${10000 + index * 100},0`,
                ],
            });
            const instancePages = instanceContext.pages();
            const instancePage = instancePages.length > 0 ? instancePages[0] : await instanceContext.newPage();

            return { context: instanceContext, page: instancePage };
        };

        const scraperWindowCount = 3;
        Helper.PrintMsg(`Launching ${scraperWindowCount} scraper windows...`);
        this.scraperInstances = [];
        for (let i = 0; i < scraperWindowCount; i++) {
            const instance = await this.launchScraperInstance(i);
            await instance.page.goto('https://www.tokopedia.com', { waitUntil: 'domcontentloaded' });
            this.scraperInstances.push(instance);
        }
        Helper.PrintMsg(`${scraperWindowCount} scraper windows ready.`);

        process.on('SIGINT', async () => {
            console.log("\nShutting down gracefully...");
            await this.close();
            process.exit(0);
        });
    }

    async close() {
        if (this.scraperInstances && this.scraperInstances.length) {
            for (const instance of this.scraperInstances) {
                try {
                    await instance.context.close();
                } catch (_) { }
            }
        }
        if (this.context) {
            await this.context.close();
        }
    }

    async run() {
        const GetFirebaseOldestPendingDataInstance = new GetFirebaseOldestPendingData(this.page, this.config);
        const ScrapPendingDataInstance = new ScrapPendingData(this.page, this.config, this.scraperInstances);

        console.log("Starting bot...");
        await this.checkProxyDetails();

        Helper.PrintMsg("Accessing Login Page...");
        await this.page.goto(this.config.pageUrl, { waitUntil: 'load' });
        Helper.PrintMsg("Login Page");
        await Helper.Delay(5);

        while (true) {
            try {
                let pendingData = null;
                while (!pendingData) {
                    Helper.PrintMsg("...Checking for pending data...");
                    pendingData = await GetFirebaseOldestPendingDataInstance.run();
                    console.log("pendingData result:", pendingData);
                    await Helper.Delay(3);
                }

                console.log("✅ pendingData ditemukan:", pendingData);
                const result = await ScrapPendingDataInstance.run(pendingData.products, pendingData.ticket_id);
                console.log("Hasil scraping:", JSON.stringify(result, null, 2));

            } catch (err) {
                console.error("Error when scraping, restarting instance:", err);
                await Helper.Delay(5);
            }
        }
    }
}

module.exports = WebScraper;
