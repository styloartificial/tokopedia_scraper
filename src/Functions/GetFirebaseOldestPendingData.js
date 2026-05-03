const axiosClass = require("../Helpers/AxiosInstance");
const axiosInstance = axiosClass.getInstance();
const Helper = require("../Helpers/Helper");

class GetFirebaseOldestPendingData {
    constructor(page, config) {
        this.page = page;
        this.config = config;
    }

    async run() {
        try {
            const res = await axiosInstance.get('/scraper/get-oldest-ticket-request');
            const data = res.data.data.products;

            return data;
        } catch (error) {
            Helper.PrintErrorMsg(`Failed to get pending data: ${error.message}`);
            throw error;
        }
    }
}

module.exports = GetFirebaseOldestPendingData;