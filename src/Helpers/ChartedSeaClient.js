const axios = require('axios');

const CHARTED_SEA_BASE_URL = 'https://continuous-scraper.common.chartedapi.com';

class ChartedSeaClient {
    constructor() {
        this.token = process.env.CHARTED_SEA_API_TOKEN;
        this.instance = axios.create({
            baseURL: CHARTED_SEA_BASE_URL,
            timeout: 60_000, // task Lazada biasanya selesai < 30 detik utk 1 halaman
        });
    }

    /**
     * Jalankan pencarian keyword di Lazada lewat Charted Sea.
     * @param {string} keyword
     * @param {{ tld?: string, language?: string }} options
     * @returns {Promise<object>} parsed responseBody (mis. { productTotal, products })
     */
    async runLazadaSearch(keyword, { tld = 'co.id', language = 'id' } = {}) {
        if (!this.token) {
            throw new Error('CHARTED_SEA_API_TOKEN belum di-set di environment.');
        }

        const searchUrl = `https://www.lazada.${tld}/catalog/?q=${encodeURIComponent(keyword)}`;

        const response = await this.instance.post(
            '/scraping-tasks/lazada/run',
            {
                requests: [{ url: searchUrl }],
                language,
            },
            {
                headers: { Authorization: `Bearer ${this.token}` },
                params: { autoCancelAfterSec: 120 }, // batas waktu 1 task, cukup utk 1 halaman
            }
        );

        // Response API selalu berupa array (1 task per request yg dikirim)
        const tasks = Array.isArray(response.data) ? response.data : [response.data];
        const task = tasks[0];

        if (!task) {
            throw new Error('Charted Sea tidak mengembalikan task apapun.');
        }

        if (task.status !== 'SUCCESS') {
            throw new Error(`Task Lazada gagal (status: ${task.status}): ${task.errorMessage || 'tanpa pesan error'}`);
        }

        // responseBody kadang string JSON, kadang sudah object — handle dua-duanya
        let body = task.responseBody;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                throw new Error(`Gagal parse responseBody dari Charted Sea: ${e.message}`);
            }
        }

        return body;
    }
}

// Singleton, mirip pola AxiosInstance.js kamu
module.exports = new ChartedSeaClient();