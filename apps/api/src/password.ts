import { randomBytes, scrypt as scryptCallback, pbkdf2 as pbkdf2Callback, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const pbkdf2=promisify(pbkdf2Callback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password: string, encoded: string) {
  if(/^pbkdf2-sha256\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(encoded)){
    const [,iterations,salt,hash]=encoded.split('$');
    const actual=await pbkdf2(password,Buffer.from(salt,'hex'),Number(iterations),32,'sha256');
    return timingSafeEqual(actual,Buffer.from(hash,'hex'));
  }
  if(/^SCRAM-SHA-256\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}\$[0-9a-f]{64}$/.test(encoded)){const [,iterations,salt,stored]=encoded.split('$');const salted=await pbkdf2(password,Buffer.from(salt,'hex'),Number(iterations),32,'sha256') as Buffer;const actual=createHash('sha256').update(createHmac('sha256',salted).update('Client Key').digest()).digest();return timingSafeEqual(actual,Buffer.from(stored,'hex'));}
  const [scheme,salt,hash] = encoded.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const actual = await scrypt(password,salt,64) as Buffer; const expected = Buffer.from(hash,'hex');
  return actual.length === expected.length && timingSafeEqual(actual,expected);
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
