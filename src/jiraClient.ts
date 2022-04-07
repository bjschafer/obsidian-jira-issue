import { ExecException, execFileSync } from "child_process";
import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
import { IJiraIssue, IJiraSearchResults } from "./interfaces";
import { EAuthenticationTypes, IJiraIssueSettings } from "./settings";

export class JiraClient {
	private _settings: IJiraIssueSettings;

	constructor(settings: IJiraIssueSettings) {
		this._settings = settings;
	}

	private buildUrl(
		path: string,
		queryParameters: URLSearchParams = null
	): string {
		const url = new URL(
			`${this._settings.host}${this._settings.apiBasePath}${path}`
		);
		if (queryParameters) {
			url.search = queryParameters.toString();
		}
		return url.toString();
	}

	private async buildHeaders(): Promise<Record<string, string>> {
		const requestHeaders: Record<string, string> = {};
		if (this._settings.authenticationType === EAuthenticationTypes.BASIC) {
			requestHeaders["Authorization"] =
				"Basic " +
				Buffer.from(
					`${this._settings.username}:${this._settings.password}`
				).toString("base64");
		} else if (
			this._settings.authenticationType ===
			EAuthenticationTypes.BEARER_TOKEN
		) {
			requestHeaders[
				this._settings.headerName
			] = `Bearer ${this._settings.bareToken}`;
		} else if (
			this._settings.authenticationType === EAuthenticationTypes.CUSTOM
		) {
			const splitCommand = this._settings.customCommand.split(" ");
			const execResult = execFileSync(splitCommand.shift(), splitCommand);
			const commandResult: string = execResult.toString();

			requestHeaders[this._settings.headerName] = commandResult;
		}
		requestHeaders["accept"] = "*/*";
		return requestHeaders;
	}

	private async sendRequest(options: RequestUrlParam): Promise<any> {
		let response: RequestUrlResponse;
		try {
			response = await requestUrl(options);
		} catch (e) {
			console.error("JiraClient::response", e);
			throw "Request error";
		}
		console.info("response", response);

		if (response.status !== 200) {
			// console.log(response.headers)
			if (
				response.headers["content-type"].contains("json") &&
				response.json &&
				response.json.errorMessages
			) {
				throw response.json.errorMessages.join("\n");
			} else {
				throw `HTTP status ${response.status}`;
			}
		}

		return response.json;
	}

	async getIssue(issue: string): Promise<IJiraIssue> {
		const response = await this.sendRequest({
			url: this.buildUrl(`/issue/${issue}`),
			method: "GET",
			headers: await this.buildHeaders(),
		});
		const imgResponse = await requestUrl({
			url: response.fields.issuetype.iconUrl,
			method: "GET",
			headers: await this.buildHeaders(),
		});
		const contentType = "image/svg+xml;charset=UTF-8";
		const blob = Buffer.from(imgResponse.text).toString("base64");
		response.icon = `data:${contentType};base64,${blob}`;
		// response.icon should now contain the base64 of the image, ready to be passed into `<img src=`
		return response;
	}

	async getSearchResults(
		query: string,
		max: number
	): Promise<IJiraSearchResults> {
		const queryParameters = new URLSearchParams({
			jql: query,
			startAt: "0",
			maxResults: max.toString(),
		});
		return await this.sendRequest({
			url: this.buildUrl(`/search`, queryParameters),
			method: "GET",
			headers: await this.buildHeaders(),
		});
	}

	async updateStatusColorCache(status: string): Promise<void> {
		if (status in this._settings.statusColorCache) {
			return;
		}
		const response = await this.sendRequest({
			url: this.buildUrl(`/status/${status}`),
			method: "GET",
			headers: await this.buildHeaders(),
		});
		this._settings.statusColorCache[status] =
			response.statusCategory.colorName;
	}
}
