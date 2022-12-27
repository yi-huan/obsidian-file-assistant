import { createHash } from 'node:crypto';

export const generateHash = (data: Buffer) => {
	const hash = createHash('md5');
	hash.update(data);
	return hash.digest('hex');
}
