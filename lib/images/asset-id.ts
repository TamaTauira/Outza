import crypto from 'crypto'

export const assetIdFor = (sourceUrl: string) => crypto.createHash('sha1').update(sourceUrl).digest('hex')
