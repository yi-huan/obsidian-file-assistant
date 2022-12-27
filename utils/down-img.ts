import * as http from 'node:http';
import * as https from 'node:https';

export function downImg(url: string, maxRedirects = 5): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		if (maxRedirects <= 0) {
			reject(new Error('超过最大重定向次数'));
			return;
		}
		(url.match(/https:\/\//) ? https : http).get(url, (res) => {
			const { statusCode } = res;
			// const contentType = res.headers['content-type'];

			if (statusCode === 301 || statusCode === 302) {
				const location = res.headers.location;
				if (location) {
					res.resume();
					return resolve(downImg(location, --maxRedirects));
				}
			}

			if (statusCode !== 200) {
				res.resume();
				reject(new Error('请求失败，状态码：' + statusCode));
				return;
			}

			// console.log('contentType', contentType);

			// res.setEncoding('utf8');

			const rawData: any[] = [];
			// let totalBytes = 0;
			res.on('data', (chunk) => {
				rawData.push(chunk);
				// totalBytes += chunk.length;
			});
			res.on('end', () => {
				// resolve(Buffer.from(rawData))
				const responseData = rawData.length === 1 ? rawData[0] : Buffer.concat(rawData);
				// console.log('responseData', responseData);
				resolve(responseData);
			});
		}).on('error', (e) => {
			console.error(`获取失败: ${e.message}`);
			reject(e);
		});
	});
}
