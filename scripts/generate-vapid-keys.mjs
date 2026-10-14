import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const publicJwk = publicKey.export({ format: 'jwk' })
const privateJwk = privateKey.export({ format: 'jwk' })
const x = Buffer.from(publicJwk.x, 'base64url')
const y = Buffer.from(publicJwk.y, 'base64url')
const rawPublic = Buffer.concat([Buffer.from([0x04]), x, y])

console.log('Guarde estes valores só nos segredos do Supabase e no .env local.')
console.log('Não commite a chave privada.')
console.log('')
console.log(`VAPID_PUBLIC_KEY=${rawPublic.toString('base64url')}`)
console.log(`VAPID_PRIVATE_KEY=${privateJwk.d}`)
console.log(`VITE_VAPID_PUBLIC_KEY=${rawPublic.toString('base64url')}`)
console.log('VAPID_SUBJECT=mailto:ops@syagri.com.br')
