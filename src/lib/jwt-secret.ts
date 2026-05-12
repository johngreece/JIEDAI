const cached = (() => {
  const value = process.env.JWT_SECRET;
  if (!value || value.trim() === "" || value === "loan-system-secret-change-in-production") {
    throw new Error(
      "JWT_SECRET 环境变量未设置或仍为默认占位值，请生成强随机值后重启（openssl rand -base64 32）"
    );
  }
  return new TextEncoder().encode(value);
})();

export const JWT_SECRET_BYTES = cached;
