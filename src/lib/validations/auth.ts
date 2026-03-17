import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

export const clientLoginSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  password: z.string().min(6, "密码由至少6位字符组成"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ClientLoginInput = z.infer<typeof clientLoginSchema>;
