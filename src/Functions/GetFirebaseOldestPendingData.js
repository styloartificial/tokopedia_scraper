const axiosClass = require("../Helpers/AxiosInstance");
const axiosInstance = axiosClass.getInstance();
const Helper = require("../Helpers/Helper");
const fs = require('fs');
const path = require('path');

const queuePath = path.join(__dirname, '../../..', 'queue.json');

class GetFirebaseOldestPendingData {
    constructor(page, config) {
        this.page = page;
        this.config = config;
    }

    async run() {
        try {
            if (!fs.existsSync(queuePath)) {
                return null;
            }

            const raw = fs.readFileSync(queuePath, 'utf8');

            if (!raw.trim()) {
                return null;
            }

            const queue = JSON.parse(raw);

            if (!Array.isArray(queue) || queue.length === 0) {
                return null;
            }
            return queue[0];
        } catch (error) {
            Helper.PrintErrorMsg(`Failed to get pending data: ${error.message}`);
            throw error;
        }
    }
}

module.exports = GetFirebaseOldestPendingData;