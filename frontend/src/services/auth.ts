import { apiRequest } from "@/lib/api";

export type ForgotPasswordResponse = {
  ok: boolean;
  message: string;
};

export type ResetPasswordResponse = {
  ok: boolean;
};

export const authApi = {
  requestPasswordReset(email: string) {
    return apiRequest<ForgotPasswordResponse>("/auth/forgot-password", "POST", { email });
  },
  resetPassword(payload: { email: string; code: string; password: string }) {
    return apiRequest<ResetPasswordResponse>("/auth/reset-password", "POST", payload);
  },
};
