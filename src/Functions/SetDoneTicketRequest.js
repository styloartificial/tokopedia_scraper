const axiosClass = require("../Helpers/AxiosInstance");
const axiosInstance = axiosClass.getInstance();
const Helper = require("../Helpers/Helper");

class SetDoneTicketRequest {
    constructor(page, config, ticketId, storedData) {
        this.page = page;
        this.config = config;
        this.ticketId = ticketId;
        this.storedData = storedData;
    }

    async run() {
        try {
            const res = await axiosInstance.post('/scraper/set-done-ticket-request', {
                ticket_request_id: this.ticketId,
                storedData: this.storedData,
            });

            return res.data;
        } catch (error) {
            Helper.PrintErrorMsg(`Failed to set done ticket request: ${error.message}`);
            throw error;
        }
    }
}

module.exports = SetDoneTicketRequest;