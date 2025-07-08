// destructured, named undiciFetch for Better readability
const { fetch: undiciFetch, Response } = require("undici");
const nodeUtil = require("node:util")

/**
 * Handles REST API communication with Lavalink nodes.
 */
class Rest {
    /**
     * @param {Node} node - The Node instance.
     * @param {object} options - Options from Node or Riffy.
     */
    constructor(node, options) {
        this.node = node;
        this.retryCount = options.restRetryCount ?? 3;
        this.timeout = options.restTimeout ?? 5000;
        this.debug = options.debug ?? false;
        // TODO: Use retryCount and timeout in makeRequest
        // TODO: Use debug to control debug event emission
        this.url = `http${options.secure ? "s" : ""}://${options.host}:${
          options.port
        }`;
        this.sessionId = options.sessionId;
        this.password = options.password;
        this.version = options.restVersion;
        this.calls = 0;
        this._successCount = 0;
        this._failureCount = 0;
        this._retryCount = 0;
    }

    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }

    /**
     * Makes a REST request with retry and rate limit handling.
     * Emits events for success, failure, and retry.
     * @param {string} method
     * @param {string} endpoint
     * @param {object|null} body
     * @param {boolean} includeHeaders
     * @returns {Promise<object>}
     */
    async makeRequest(method, endpoint, body = null, includeHeaders = false) {
        const headers = {
            "Content-Type": "application/json",
            Authorization: this.password,
        };
        const requestOptions = {
            method,
            headers,
            body: body ? JSON.stringify(body) : null,
        };
        let attempt = 0;
        let lastError;
        while (attempt < 3) {
            try {
                const response = await undiciFetch(this.url + endpoint, requestOptions);
                if (response.status === 429) {
                    // Rate limited, wait and retry
                    const retryAfter = parseInt(response.headers.get('retry-after')) || (500 * (attempt + 1));
                    await new Promise(res => setTimeout(res, retryAfter));
                    attempt++;
                    this._retryCount++;
                    this.node.emit('restRequestRetry', endpoint, attempt, retryAfter);
                    continue;
                }
                this.calls++;
                this._successCount++;
                const data = await this.parseResponse(response);
                this.node.emit("apiResponse", endpoint, response);
                this.node.emit('restRequestSuccess', endpoint, response.status, data);
                this.node.emit(
                    "debug",
                    `[Rest] ${requestOptions.method} ${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}` +
                    `${body ? `body: ${JSON.stringify(body)}` : ""} -> \n Status Code: ${response.status}(${response.statusText}) \n Response(body): ${JSON.stringify(await data)} \n Headers: ${nodeUtil.inspect(response.headers)}`
                );
                return includeHeaders === true ? { data, headers: response.headers } : data;
            } catch (e) {
                lastError = e;
                this._failureCount++;
                this.node.emit('restRequestFailure', endpoint, attempt, e);
                // Network error, retry
                await new Promise(res => setTimeout(res, 500 * Math.pow(2, attempt)));
                attempt++;
            }
        }
        throw lastError || new Error(`Failed to make request to ${endpoint}`);
    }

    async getPlayers() {
        return this.makeRequest(
            "GET",
            `/${this.version}/sessions/${this.sessionId}/players`
        );
    }

    async updatePlayer(options) {
        // destructure data as requestBody for ease of use.
        let { data: requestBody } = options;

        if (
            (typeof requestBody.track !== "undefined" &&
                requestBody.track.encoded &&
                requestBody.track.identifier) ||
            (requestBody.encodedTrack && requestBody.identifier)
        )
            throw new Error(
                `${
                    typeof requestBody.track !== "undefined"
                        ? `encoded And identifier`
                        : `encodedTrack And identifier`
                } are mutually exclusive (Can't be provided together) in Update Player Endpoint`
            );

        if (this.version === "v3" && options.data?.track) {
            const { track, ...otherRequestData } = requestBody;

            requestBody = { ...otherRequestData };

            Object.assign(
                options.data,
                typeof options.data.track.encoded !== "undefined"
                    ? { encodedTrack: track.encoded }
                    : { identifier: track.identifier }
            );
        }

        return this.makeRequest(
            "PATCH",
            `/${this.version}/sessions/${this.sessionId}/players/${options.guildId}?noReplace=false`,
            options.data
        );
    }

    async destroyPlayer(guildId) {
        return this.makeRequest(
            "DELETE",
            `/${this.version}/sessions/${this.sessionId}/players/${guildId}`
        );
    }

    async getTracks(identifier) {
        return this.makeRequest(
            "GET",
            `/${this.version}/loadtracks?identifier=${encodeURIComponent(identifier)}`
        );
    }

    async decodeTrack(track, node) {
        if (!node) node = this.leastUsedNodes[0];
        return this.makeRequest(
            `GET`,
            `/${this.version}/decodetrack?encodedTrack=${encodeURIComponent(track)}`
        );
    }

    async decodeTracks(tracks) {
        return this.makeRequest(
            `POST`,
            `/${this.version}/decodetracks`,
            tracks
        );
    }

    async getStats() {
        return this.makeRequest("GET", `/${this.version}/stats`);
    }

    async getInfo() {
        return this.makeRequest("GET", `/${this.version}/info`);
    }

    async getRoutePlannerStatus() {
        return this.makeRequest(
            `GET`,
            `/${this.version}/routeplanner/status`
        );
    }
    async getRoutePlannerAddress(address) {
        return this.makeRequest(
            `POST`,
            `/${this.version}/routeplanner/free/address`,
            { address }
        );
    }

    /**
     * Returns REST request metrics (counts, error rate).
     * @returns {object}
     */
    getMetrics() {
        const total = this._successCount + this._failureCount;
        return {
            calls: this.calls,
            success: this._successCount,
            failure: this._failureCount,
            retry: this._retryCount,
            errorRate: total > 0 ? this._failureCount / total : 0,
        };
    }

    /**
     * @description Parses The Process Request and Performs necessary Checks(if statements)
     * @param {Response} req
     * @returns {object | null}
     */
    async parseResponse(req) {
        if (req.status === 204) {
            return null;
        }

        try {
            return await req[req.headers.get("Content-Type").includes("text/plain") ? "text" : "json"]();
        } catch (e) {
            this.node.emit(
                "debug",
                `[Rest - Error] There was an Error for ${
                    new URL(req.url).pathname
                } ${e}`
            );
            return null;
        }
    }
}

module.exports = { Rest };
