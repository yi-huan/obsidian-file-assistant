import isSvg from 'is-svg';
import { fileTypeFromBuffer } from 'file-type';

export async function getExt (data: Buffer) {
	const { ext } = await fileTypeFromBuffer(data) || {};

	if (ext === 'xml' && isSvg(data)) {
		return 'svg';
	}

	return ext ? '.' + ext : '';
}
