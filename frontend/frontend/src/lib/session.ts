import Cookies from "js-cookie";

const isSecureContext =
  typeof window !== "undefined" && window.location.protocol === "https:";

const baseCookieOptions: Cookies.CookieAttributes = {
  sameSite: "strict",
  secure: isSecureContext,
  path: "/",
};

export const REMEMBER_ME_COOKIE = "rememberMe";

export function isRememberMeEnabled(): boolean {
  return Cookies.get(REMEMBER_ME_COOKIE) === "1";
}

export function setAuthCookies(params: {
  accessToken?: string;
  refreshToken?: string;
  rememberMe: boolean;
}) {
  const { rememberMe } = params;

  if (rememberMe) {
    Cookies.set(REMEMBER_ME_COOKIE, "1", {
      ...baseCookieOptions,
      expires: 30,
    });
    return;
  }

  Cookies.set(REMEMBER_ME_COOKIE, "0", baseCookieOptions);
}

export function clearAuthCookies() {
  // SECURITY: auth tokens are HttpOnly cookies managed by the auth service.
  Cookies.remove(REMEMBER_ME_COOKIE, { path: "/" });
}
