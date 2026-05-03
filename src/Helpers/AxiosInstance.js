const axios = require('axios');

let token = null;

class AxiosInstance {
    constructor() {
        this.instance = axios.create({
            baseURL: process.env.AXIOS_API_URL || 'http://localhost:3000/api',
        });

        this._initializeInterceptor();
    }

    _initializeInterceptor() {
        this.instance.interceptors.request.use(
            (config) => {
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );
    }

    async init() {
        try {
            const email = process.env.SCRAPER_EMAIL;
            const password = process.env.SCRAPER_PASSWORD;

            console.log('Logging in scraper...');

            const response = await this.instance.post('/auth/login/scraper', {
                email,
                password,
            });

            token = response.data.data?.token || response.data.token;

            if (!token) {
                throw new Error('Token tidak ditemukan di response');
            }

            console.log('Login scraper berhasil!');
        } catch (error) {
            console.error('Init login failed:', error.message);
            throw error;
        }
    }

    getInstance() {
        return this.instance;
    }
}

const axiosClass = new AxiosInstance();

module.exports = axiosClass;