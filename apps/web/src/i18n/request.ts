import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { resolveLocale } from '@converflow/shared';
import { messagesFor } from './messages';

/**
 * Idioma de cada petición.
 *
 * Sin enrutado por URL: el idioma es del USUARIO, no de la ruta, así que
 * ninguna URL cambia y los enlaces guardados siguen funcionando. La API escribe
 * la cookie `cf_locale` al iniciar sesión y al cambiarlo en el perfil; la base
 * de datos (`User.locale`) sigue siendo la fuente de verdad y la cookie solo la
 * transporta hasta aquí, donde no se puede consultar la base por render.
 */
export default getRequestConfig(async () => {
  const locale = resolveLocale((await cookies()).get('cf_locale')?.value);
  return { locale, messages: await messagesFor(locale) };
});
