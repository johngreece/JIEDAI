import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** 对明文密码进行哈希 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** 验证明文密码与哈希是否匹配 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // 兼容旧数据：如果 hash 不是 bcrypt 格式（$2a$ / $2b$），则降级为明文比对
  // 登录成功后应自动升级为 bcrypt 哈希
  if (!hash.startsWith("$2a$") && !hash.startsWith("$2b$")) {
    return plain === hash;
  }
  return bcrypt.compare(plain, hash);
}

/** 判断一个字符串是否已经是 bcrypt 哈希 */
export function isBcryptHash(value: string): boolean {
  return value.startsWith("$2a$") || value.startsWith("$2b$");
}
