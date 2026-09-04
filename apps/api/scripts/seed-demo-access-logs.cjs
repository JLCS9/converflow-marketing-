/**
 * Genera un histórico de Logs de acceso (`AccessLog`, panel de superadmin →
 * `/admin/access-logs`) de EJEMPLO para un tenant de demo/venta, simulando
 * ~90 días de actividad de un equipo pequeño tipo educación/e-learning:
 * logins entre semana (jornada laboral, algún fin de semana suelto), algún
 * fallo ocasional de contraseña, incorporación del equipo al principio del
 * periodo, algún cambio de contraseña. Es una herramienta puntual para
 * preparar una cuenta de demostración — NO una migración que deba correr en
 * cada deploy ni sobre tenants reales de un cliente.
 *
 * Usa los USUARIOS REALES ya registrados en el tenant encontrado — no
 * inventa personas ni correos. Localiza el tenant por, en orden de
 * precisión: --id (exacto), --slug (exacto) o --tenant (nombre, coincidencia
 * PARCIAL insensible a mayúsculas — ojo: el `name` de un tenant puede NO
 * contener el nombre comercial que usas de memoria; dos tenants distintos
 * pueden compartir el mismo `name` — usa --slug o --id si hay ambigüedad).
 * Imprime SIEMPRE qué tenant y qué usuarios ha resuelto antes de escribir
 * nada, para poder frenar si no es el que tocaba.
 *
 * IPs y user-agents son sintéticos: las IPs usan los rangos que la IANA
 * reserva para documentación/ejemplos (RFC 5737 — 192.0.2.0/24,
 * 198.51.100.0/24, 203.0.113.0/24), que NUNCA resuelven a una
 * infraestructura real — para que quede inequívoco que son datos de
 * demostración, no tráfico capturado de verdad.
 *
 * Por defecto solo SIMULA (imprime lo que crearía); hay que pasar --apply
 * para escribir. Sin restricción de unicidad en AccessLog: si se ejecuta
 * dos veces con --apply, duplica los eventos — pensado para una sola pasada
 * sobre una cuenta de demo recién creada.
 *
 *   node apps/api/scripts/seed-demo-access-logs.cjs --slug "chesterton-meco"
 *   node apps/api/scripts/seed-demo-access-logs.cjs --slug "chesterton-meco" --apply
 *   node apps/api/scripts/seed-demo-access-logs.cjs --id "cmpuyo7o2000iqw01r889hmry" --apply
 */
const { prisma, withRlsBypass } = require('@converflow/db');

const APPLY = process.argv.includes('--apply');
function argAfter(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}
const TENANT_ID = argAfter('--id');
const TENANT_SLUG = argAfter('--slug');
const TENANT_QUERY = argAfter('--tenant') ?? (TENANT_ID || TENANT_SLUG ? undefined : 'chesterton');
const DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// RFC 5737 — direcciones "TEST-NET" reservadas para documentación, nunca
// asignadas a tráfico real.
const DOC_IPS = [
  ...Array.from({ length: 20 }, (_, i) => `203.0.113.${10 + i}`),
  ...Array.from({ length: 20 }, (_, i) => `198.51.100.${10 + i}`),
  ...Array.from({ length: 10 }, (_, i) => `192.0.2.${10 + i}`),
];
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function atHour(base, hFrom, hSpan) {
  const d = new Date(base);
  d.setHours(hFrom + Math.floor(Math.random() * hSpan), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
  return d;
}

async function main() {
  const where = TENANT_ID
    ? { id: TENANT_ID }
    : TENANT_SLUG
      ? { slug: TENANT_SLUG }
      : { name: { contains: TENANT_QUERY, mode: 'insensitive' } };

  const tenant = await withRlsBypass(prisma, (tx) =>
    tx.tenant.findFirst({
      where,
      include: { users: { where: { status: 'ACTIVE' }, select: { id: true, email: true, name: true, role: true } } },
    }),
  );
  if (!tenant) {
    console.error(`No se encontró ningún tenant con ese criterio (${JSON.stringify(where)}). Prueba --id/--slug/--tenant.`);
    await prisma.$disconnect();
    return;
  }
  if (!TENANT_ID && !TENANT_SLUG) {
    // Búsqueda por nombre parcial: puede haber más de un tenant con el mismo
    // `name` (p. ej. varios tenants literalmente llamados "Raquel") — avisar
    // en vez de aplicar en silencio al primero que devuelva la BD.
    const matches = await withRlsBypass(prisma, (tx) =>
      tx.tenant.count({ where }),
    );
    if (matches > 1) {
      console.error(
        `AMBIGUO: ${matches} tenants coinciden con --tenant "${TENANT_QUERY}". Usa --slug o --id para elegir uno exacto (ver /admin/tenants o consulta la BD).`,
      );
      await prisma.$disconnect();
      return;
    }
  }
  if (tenant.users.length === 0) {
    console.error(`El tenant "${tenant.name}" (${tenant.id}) no tiene usuarios ACTIVOS — nada que simular.`);
    await prisma.$disconnect();
    return;
  }

  console.info(`Tenant encontrado: "${tenant.name}" (id=${tenant.id}, slug=${tenant.slug})`);
  console.info(`Usuarios activos (${tenant.users.length}): ${tenant.users.map((u) => `${u.name} <${u.email}>`).join(', ')}`);
  console.info(APPLY ? '\n=== GENERANDO LOGS ===\n' : '\n=== SIMULACIÓN (usa --apply para escribir) ===\n');

  const now = new Date();
  const events = [];

  // Incorporación del equipo cerca del principio del periodo simulado — el
  // primer usuario (más antiguo) invita al resto, en los primeros días.
  if (tenant.users.length > 1) {
    const inviter = tenant.users[0];
    let day = DAYS - Math.floor(Math.random() * 4) - 1;
    for (const invitee of tenant.users.slice(1)) {
      const at = atHour(new Date(now.getTime() - day * DAY_MS), 9, 8);
      events.push({
        tenantId: tenant.id,
        userId: inviter.id,
        email: inviter.email,
        action: 'invite_user',
        success: true,
        ip: pick(DOC_IPS),
        userAgent: pick(USER_AGENTS),
        createdAt: at,
        metadata: { invitedUserId: invitee.id, role: invitee.role },
      });
      day = Math.max(0, day - Math.floor(Math.random() * 2));
    }
  }

  // Login diario por usuario — patrón "equipo de oficina": entre semana casi
  // siempre, algún fin de semana suelto, 1-2 sesiones/día, algún fallo de
  // contraseña ocasional, logout explícito en parte de las sesiones.
  for (const user of tenant.users) {
    for (let day = DAYS; day >= 0; day--) {
      const date = new Date(now.getTime() - day * DAY_MS);
      const weekend = isWeekend(date);
      const willLogin = Math.random() < (weekend ? 0.08 : 0.85);
      if (!willLogin) continue;

      const sessions = 1 + (Math.random() < 0.3 ? 1 : 0);
      for (let s = 0; s < sessions; s++) {
        const at = atHour(date, 8, 10);
        if (at > now) continue;
        const ip = pick(DOC_IPS);
        const ua = pick(USER_AGENTS);

        // ~4% de las sesiones llevan un intento fallido justo antes (typo
        // de contraseña) — mismo email/usuario, como hace el código real.
        if (Math.random() < 0.04) {
          const failAt = new Date(at.getTime() - 60_000 - Math.floor(Math.random() * 120_000));
          events.push({ tenantId: tenant.id, userId: user.id, email: user.email, action: 'login', success: false, ip, userAgent: ua, createdAt: failAt });
        }
        events.push({ tenantId: tenant.id, userId: user.id, email: user.email, action: 'login', success: true, ip, userAgent: ua, createdAt: at });

        // ~40% cierran sesión explícitamente unas horas después (el resto,
        // como en la vida real, simplemente cierra la pestaña).
        if (Math.random() < 0.4) {
          const logoutAt = new Date(at.getTime() + (2 + Math.random() * 5) * 3_600_000);
          if (logoutAt < now) {
            events.push({ tenantId: tenant.id, userId: user.id, email: user.email, action: 'logout', success: true, ip, userAgent: ua, createdAt: logoutAt });
          }
        }
      }
    }

    // Un cambio de contraseña suelto en el periodo, con ~40% de probabilidad
    // por usuario (higiene de seguridad normal, no todo el mundo lo hace).
    if (Math.random() < 0.4) {
      const day = Math.floor(Math.random() * DAYS);
      const at = atHour(new Date(now.getTime() - day * DAY_MS), 9, 8);
      events.push({ tenantId: tenant.id, userId: user.id, email: user.email, action: 'change_password', success: true, ip: pick(DOC_IPS), userAgent: pick(USER_AGENTS), createdAt: at });
    }
  }

  events.sort((a, b) => a.createdAt - b.createdAt);

  const byAction = {};
  for (const e of events) byAction[e.action] = (byAction[e.action] ?? 0) + 1;
  console.info(`Eventos a ${APPLY ? 'crear' : 'simular'}: ${events.length}`);
  for (const [action, n] of Object.entries(byAction)) console.info(`  ${action}: ${n}`);
  if (events.length > 0) {
    console.info(`Rango: ${events[0].createdAt.toISOString().slice(0, 10)} → ${events[events.length - 1].createdAt.toISOString().slice(0, 10)}`);
  }

  if (APPLY) {
    const BATCH = 200;
    for (let i = 0; i < events.length; i += BATCH) {
      const batch = events.slice(i, i + BATCH);
      await withRlsBypass(prisma, (tx) => tx.accessLog.createMany({ data: batch }));
    }
    console.info(`\n${events.length} registros creados en access_logs.`);
    console.info('Compruébalo en /admin/access-logs filtrando por ese tenant.');
  } else {
    console.info('\nNada escrito. Repite con --apply cuando lo veas bien.');
  }

  await prisma.$disconnect();
}

void main();
