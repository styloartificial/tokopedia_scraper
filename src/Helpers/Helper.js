const colors = require("colors");
const moment = require("moment");

class Helper {
    static async Delay(s) {
        return new Promise(resolve => setTimeout(resolve, s * 1000));
    }

    static PrintMsg(msg) {
        console.log(
            colors.yellow(moment().format("YYYY-MM-DD hh:mm:ss")),
            colors.green(msg)
        );
    }

    static PrintErrorMsg(msg) {
        console.error(
            colors.yellow(moment().format("YYYY-MM-DD hh:mm:ss")),
            colors.red(msg)
        );
    }

    static async SafeAction(p, selector, action, options = {}) {
        const {
            value = null,
            description = 'Unknown element',
            timeout = 5000,
            delay = 100,
            hidden = false,
            nth = null,
            state = 'visible',
            maxRetries = 2
        } = options;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                Helper.PrintMsg(`[${attempt}/${maxRetries}] ${action.toUpperCase()} on: ${description}`);

                let locator;

                if (typeof selector === 'function') {
                    locator = selector(p);
                } else if (typeof selector === 'string') {
                    locator = p.locator(selector);
                } else {
                    locator = selector;
                }

                // ✅ Handle nth / first
                if (nth !== null && nth !== undefined) {
                    locator = locator.nth(nth);
                } else {
                    locator = locator.first();
                }

                // ✅ Wait using locator (NOT waitForSelector)
                if (action !== 'wait') {
                    await locator.waitFor({
                        state: hidden ? 'attached' : state,
                        timeout
                    });
                }

                // ✅ Perform action
                switch (action) {
                    case 'click':
                        await locator.click({ timeout });
                        break;

                    case 'type':
                        await locator.type(value, { delay, timeout });
                        break;

                    case 'fill':
                        await locator.fill(value, { timeout });
                        break;

                    case 'text':
                        return await locator.textContent();

                    case 'wait':
                        await locator.waitFor({ state, timeout });
                        break;

                    default:
                        throw new Error(`Action '${action}' not supported`);
                }

                await Helper.Delay(1);
                return true;

            } catch (error) {
                Helper.PrintErrorMsg(`Attempt ${attempt} failed: ${error.message}`);

                if (attempt === maxRetries) {
                    throw new Error(
                        `❌ Failed ${action} on "${description}" after ${maxRetries} attempts`
                    );
                }
            }
        }
    }
}

module.exports = Helper;