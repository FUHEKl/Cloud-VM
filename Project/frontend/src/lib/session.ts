import Cookies from "js-cookie";

const isSecureContext =
  typeof window !== "undefined" && window.location.protocol === "https:";

const baseCookieOptions: Cookies.CookieAttributes = {
  sameSite: "lax",
  secure: isSecureContext,
};

export const REMEMBER_ME_COOKIE = "rememberMe";

export function isRememberMeEnabled(): boolean {
  return Cookies.get(REMEMBER_ME_COOKIE) === "1";
}

export function setAuthCookies(params: {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
}) {
  const { accessToken, refreshToken, rememberMe } = params;

  if (rememberMe) {
    Cookies.set("accessToken", accessToken, {
      ...baseCookieOptions,
      expires: 1,
    });
    Cookies.set("refreshToken", refreshToken, {
      ...baseCookieOptions,
      expires: 7,
    });
    Cookies.set(REMEMBER_ME_COOKIE, "1", {
      ...baseCookieOptions,
      expires: 30,
    });
    return;
  }

  Cookies.set("accessToken", accessToken, baseCookieOptions);
  Cookies.set("refreshToken", refreshToken, baseCookieOptions);
  Cookies.set(REMEMBER_ME_COOKIE, "0", baseCookieOptions);
}

export function clearAuthCookies() {
  Cookies.remove("accessToken");
  Cookies.remove("refreshToken");
  Cookies.remove(REMEMBER_ME_COOKIE);
}
