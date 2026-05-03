require('dotenv').config();
const axiosInstance = require('./src/Helpers/AxiosInstance');
const WebScraper = require("./src/Scraper.js");

(async () => {
    // Login scraper dulu sebelum jalankan WebScraper
    await axiosInstance.init();

    const scraper = new WebScraper();
    await scraper.init();
    await scraper.run();
})();