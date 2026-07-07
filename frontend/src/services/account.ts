import { apiRequest, type ApiRequestOptions } from "@/lib/api";

export type AccountUserDto = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  defaultPlatform: string | null;
  calendarSchedulingUrl: string;
};

export type BusinessProfileDto = {
  tradeName: string | null;
  legalName: string | null;
  taxId: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  website: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  logoUrl: string | null;
};

export type AccountProfileResponse = {
  user: AccountUserDto;
  business: BusinessProfileDto | null;
};

export const accountApi = {
  getProfile: (token: string, options?: ApiRequestOptions) =>
    apiRequest<AccountProfileResponse>("/account/profile", "GET", undefined, token, options),
  patchProfile: (token: string, body: { user?: Partial<Pick<AccountUserDto, "name" | "phone" | "defaultPlatform" | "calendarSchedulingUrl">>; business?: Partial<BusinessProfileDto> }) =>
    apiRequest<AccountProfileResponse>("/account/profile", "PATCH", body, token),
  deleteAccount: (token: string, body: { confirmText: string }) => apiRequest<void>("/account", "DELETE", body, token),
};
