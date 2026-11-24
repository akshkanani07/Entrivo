import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { normalizeLocale, resolveLocale } from "@/i18n/locale";
import messagesEn from "../../messages/en.json";
import messagesGu from "../../messages/gu.json";
import messagesHi from "../../messages/hi.json";

const messagesByLocale = {
  en: messagesEn,
  gu: messagesGu,
  hi: messagesHi,
};

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const hasExplicitLocale = normalizeLocale(cookieLocale) !== undefined;
  const currentUser = hasExplicitLocale ? null : await getCurrentUser();

  const locale = resolveLocale({
    cookieLocale,
    userLocale: currentUser?.locale,
    organizationLocale: currentUser?.organizationLocale,
    acceptLanguage: headerStore.get("accept-language"),
  });

  return {
    locale,
    messages: messagesByLocale[locale],
  };
});
