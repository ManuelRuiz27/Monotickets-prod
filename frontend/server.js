import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.FRONTEND_PORT || 3000);

const routes = {
  '/': homepage,
  '/staff': staffPortal,
};

const server = http.createServer(async (req, res) => {
  const requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('x-request-id', requestId);
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && routes[url.pathname]) {
    const body = routes[url.pathname]();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
    log({ level: 'info', message: 'frontend_request', path: url.pathname, request_id: requestId });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', service: 'frontend-staff' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
  log({ level: 'warn', message: 'frontend_not_found', path: url.pathname, request_id: requestId });
});

server.listen(PORT, () => {
  log({ level: 'info', message: 'frontend_started', port: PORT, request_id: randomUUID() });
});

function homepage() {
  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Monotickets · Experiencia</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        :root {
          color-scheme: light;
          --blue-600: #2563eb;
          --ink-900: #111827;
          --ink-600: #374151;
          --ink-200: #e5e7eb;
          --surface: #f9fafb;
          --radius-lg: 20px;
          --font-body: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          font-family: var(--font-body);
          background: radial-gradient(circle at 10% 20%, rgba(59,130,246,0.08), transparent 40%),
                      radial-gradient(circle at 90% 10%, rgba(59,130,246,0.12), transparent 45%),
                      var(--surface);
          color: var(--ink-900);
          display: grid;
          place-items: center;
          padding: 48px 16px;
        }
        main {
          width: min(960px, 95vw);
          background: #fff;
          border-radius: var(--radius-lg);
          box-shadow: 0 24px 60px rgba(17, 24, 39, 0.16);
          padding: clamp(24px, 5vw, 48px);
          display: grid;
          gap: clamp(24px, 4vw, 36px);
        }
        h1 {
          margin: 0;
          font-size: clamp(2.2rem, 4vw, 3.2rem);
        }
        p {
          margin: 0;
          font-size: 1.1rem;
          line-height: 1.6;
          color: var(--ink-600);
        }
        .cta-group {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }
        a.primary {
          padding: 14px 28px;
          border-radius: 999px;
          background: var(--blue-600);
          color: #fff;
          text-decoration: none;
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        a.secondary {
          padding: 14px 28px;
          border-radius: 999px;
          border: 1px solid var(--ink-200);
          background: rgba(255,255,255,0.9);
          color: var(--ink-900);
          text-decoration: none;
          font-weight: 600;
        }
        ul.feature-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          padding: 0;
          list-style: none;
        }
        ul.feature-grid li {
          padding: 20px;
          border-radius: 16px;
          background: rgba(37, 99, 235, 0.08);
          border: 1px solid rgba(37, 99, 235, 0.15);
        }
        hr {
          border: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(17,24,39,0.2), transparent);
        }
      </style>
    </head>
    <body>
      <main>
        <header>
          <h1>Plataforma Monotickets</h1>
          <p>
            Kit de herramientas para equipos de check-in, organizadores y asistentes. Todo el contenido que aparece aquí es una demostración sin conexión a servicios externos.
          </p>
        </header>
        <section class="cta-group" aria-label="Enlaces rápidos">
          <a class="primary" href="/staff">Ir al portal de staff</a>
          <a class="secondary" href="http://localhost:3000" aria-disabled="true">Invitados (PWA) · usar servicio docker</a>
        </section>
        <section>
          <h2>¿Qué incluye este entorno?</h2>
          <ul class="feature-grid">
            <li>
              <strong>Simulador de escaneo</strong>
              <p>Introduce códigos de ejemplo para ver respuestas de válido, duplicado o inválido con feedback accesible.</p>
            </li>
            <li>
              <strong>PWA de invitado</strong>
              <p>Navega por portada, detalles y QR con datos de muestra que reflejan el estado del invitado.</p>
            </li>
            <li>
              <strong>Panel del organizador</strong>
              <p>Consulta métricas mock, cards de eventos y formularios con validaciones básicas.</p>
            </li>
          </ul>
        </section>
        <hr />
        <footer>
          <p>
            Usa <code>docker compose -f infra/docker-compose.yml --profile dev up --build pwa dashboard</code> para levantar las versiones Next.js incluidas.
          </p>
        </footer>
      </main>
    </body>
  </html>`;
}

function staffPortal() {
  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Monotickets · Centro de check-in</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        :root {
          color-scheme: light;
          --navy-900: #0f172a;
          --navy-700: #1e293b;
          --navy-100: #e2e8f0;
          --emerald-500: #10b981;
          --amber-500: #f59e0b;
          --rose-500: #f43f5e;
          --surface: #f8fafc;
          --radius: 18px;
          --font-body: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          font-family: var(--font-body);
          background: radial-gradient(circle at 20% -10%, rgba(16,185,129,0.18), transparent 50%),
                      radial-gradient(circle at 90% 10%, rgba(59,130,246,0.18), transparent 45%),
                      var(--surface);
          color: var(--navy-900);
        }
        a.skip-link {
          position: absolute;
          top: -40px;
          left: 12px;
          padding: 8px 16px;
          background: #fff;
          border-radius: 999px;
          color: var(--navy-900);
          border: 1px solid var(--navy-100);
          font-weight: 600;
        }
        a.skip-link:focus {
          top: 12px;
          outline: 2px solid var(--emerald-500);
        }
        header {
          padding: clamp(24px, 4vw, 48px);
          display: grid;
          gap: 16px;
        }
        header h1 {
          margin: 0;
          font-size: clamp(2.4rem, 5vw, 3.4rem);
        }
        header p {
          margin: 0;
          max-width: 560px;
          color: var(--navy-700);
          font-size: 1.05rem;
          line-height: 1.6;
        }
        main {
          padding: 0 clamp(16px, 6vw, 64px) clamp(48px, 6vw, 80px);
          display: grid;
          gap: clamp(32px, 5vw, 48px);
        }
        section.card {
          background: rgba(255,255,255,0.92);
          border-radius: var(--radius);
          border: 1px solid rgba(15,23,42,0.08);
          padding: clamp(16px, 3vw, 32px);
          box-shadow: 0 18px 45px rgba(15,23,42,0.18);
        }
        section.card h2 {
          margin-top: 0;
          font-size: clamp(1.5rem, 3vw, 2rem);
        }
        .scan-form {
          display: grid;
          gap: 16px;
          align-content: start;
        }
        .form-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        label span {
          font-weight: 600;
          display: flex;
          gap: 6px;
          align-items: center;
        }
        input[type="text"] {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: 1px solid var(--navy-100);
          font-size: 1rem;
        }
        input[type="text"]:focus {
          outline: 3px solid rgba(37,99,235,0.35);
          border-color: var(--navy-700);
        }
        button.primary {
          justify-self: start;
          padding: 12px 24px;
          background: linear-gradient(135deg, #2563eb, #4f46e5);
          border: none;
          color: white;
          font-weight: 600;
          border-radius: 999px;
          cursor: pointer;
        }
        button.primary:focus-visible {
          outline: 3px solid rgba(37, 99, 235, 0.6);
          outline-offset: 3px;
        }
        button.secondary {
          padding: 10px 20px;
          border-radius: 999px;
          border: 1px dashed rgba(15,23,42,0.25);
          background: rgba(15,23,42,0.04);
          color: var(--navy-700);
          cursor: pointer;
        }
        .quick-buttons {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .status-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 999px;
          font-weight: 600;
        }
        .status-valid { background: rgba(16,185,129,0.12); color: #047857; }
        .status-duplicate { background: rgba(245,158,11,0.12); color: #b45309; }
        .status-invalid { background: rgba(244,63,94,0.12); color: #be123c; }
        .status-pending { background: rgba(59,130,246,0.12); color: #1d4ed8; }
        .scan-feedback {
          min-height: 120px;
          display: grid;
          gap: 8px;
          border-radius: 16px;
          padding: 16px 18px;
          border: 1px solid rgba(15,23,42,0.08);
          background: rgba(255,255,255,0.85);
        }
        .history-table {
          width: 100%;
          border-collapse: collapse;
        }
        .history-table th,
        .history-table td {
          padding: 12px 10px;
          text-align: left;
          border-bottom: 1px solid rgba(15,23,42,0.08);
        }
        .history-table tbody tr:focus-within,
        .history-table tbody tr:hover {
          background: rgba(37,99,235,0.08);
        }
        dl.summary {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          margin: 0;
        }
        dl.summary div {
          background: rgba(15,23,42,0.05);
          border-radius: 14px;
          padding: 12px;
          text-align: center;
        }
        dl.summary dt {
          margin: 0;
          font-size: 0.85rem;
          color: var(--navy-700);
        }
        dl.summary dd {
          margin: 0;
          font-size: 1.4rem;
          font-weight: 700;
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-play-state: paused !important; transition: none !important; }
        }
      </style>
    </head>
    <body>
      <a class="skip-link" href="#scan-simulator">Saltar al simulador</a>
      <header>
        <h1>Centro de check-in</h1>
        <p>
          Esta pantalla reproduce el flujo de validación que utilizaría el personal en accesos. Usa los códigos de ejemplo o escribe uno manualmente para ver cómo responde el sistema.
        </p>
      </header>
      <main id="scan-simulator">
        <section class="card" aria-labelledby="scan-heading">
          <header>
            <h2 id="scan-heading">Simulador de escaneo</h2>
            <p>Los códigos de ejemplo: <strong>MT-VALID-001</strong>, <strong>MT-DUP-991</strong>, <strong>MT-PEND-204</strong>, <strong>MT-XYZ</strong>.</p>
          </header>
          <form class="scan-form" id="scan-form" autocomplete="off">
            <div class="form-grid">
              <label for="scan-code">
                <span>Código QR</span>
                <input id="scan-code" name="code" type="text" inputmode="text" placeholder="Ej. MT-VALID-001" required aria-required="true" />
              </label>
              <label for="scan-event">
                <span>Evento</span>
                <input id="scan-event" name="eventId" type="text" value="demo-event" aria-describedby="event-help" />
              </label>
            </div>
            <p id="event-help" style="margin:0; color: var(--navy-700); font-size: 0.9rem;">
              El ID de evento se usa solo para registro histórico en esta simulación.
            </p>
            <div class="quick-buttons" role="group" aria-label="Rellenar con un ejemplo">
              <button type="button" class="secondary" data-code="MT-VALID-001">Escaneo válido</button>
              <button type="button" class="secondary" data-code="MT-DUP-991">Escaneo duplicado</button>
              <button type="button" class="secondary" data-code="MT-PEND-204">Invitado pendiente</button>
              <button type="button" class="secondary" data-code="MT-XYZ">Código inexistente</button>
            </div>
            <button type="submit" class="primary">Validar código</button>
          </form>
          <div class="scan-feedback" role="status" aria-live="polite" aria-atomic="true">
            <span id="scan-result-badge" class="status-chip status-pending">Esperando lectura…</span>
            <p id="scan-status" style="margin: 0; color: var(--navy-700);">
              Introduce un código para conocer el resultado. Todo el texto se anuncia con lector de pantalla automáticamente.
            </p>
          </div>
        </section>
        <section class="card" aria-labelledby="summary-heading">
          <h2 id="summary-heading">Resumen de escaneos (sesión local)</h2>
          <dl class="summary">
            <div>
              <dt>Válidos</dt>
              <dd data-summary="valid">0</dd>
            </div>
            <div>
              <dt>Duplicados</dt>
              <dd data-summary="duplicate">0</dd>
            </div>
            <div>
              <dt>Inválidos</dt>
              <dd data-summary="invalid">0</dd>
            </div>
            <div>
              <dt>Pendientes</dt>
              <dd data-summary="pending">0</dd>
            </div>
          </dl>
        </section>
        <section class="card" aria-labelledby="history-heading">
          <h2 id="history-heading">Últimos escaneos</h2>
          <div style="overflow-x: auto;">
            <table class="history-table">
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Código</th>
                  <th scope="col">Evento</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody id="scan-history">
                <tr>
                  <td colspan="4" style="text-align:center; color: var(--navy-700); padding: 24px;">
                    Aún no hay registros. Cada validación aparecerá aquí con su estado.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <script>
        (() => {
          const SAMPLE_CODES = new Map([
            ['MT-VALID-001', 'valid'],
            ['MT-DUP-991', 'duplicate'],
            ['MT-PEND-204', 'pending'],
            ['MT-XYZ', 'invalid'],
          ]);
          const STATUS_LABELS = {
            valid: { text: 'Acceso concedido. Registrar como asistente.', description: 'El invitado queda marcado como escaneado en el sistema.', chipClass: 'status-chip status-valid' },
            duplicate: { text: 'Código ya utilizado. Revisa identidad y marca incidencia.', description: 'Contacta a coordinación para confirmar si el acceso ya fue registrado.', chipClass: 'status-chip status-duplicate' },
            invalid: { text: 'Código no reconocido. Solicita una identificación o reenvía invitación.', description: 'No encontramos este código en el padrón. Verifica que esté bien escrito.', chipClass: 'status-chip status-invalid' },
            pending: { text: 'Invitado pendiente. Debe confirmar antes de ingresar.', description: 'La invitación existe pero aún no está confirmada. Puedes invitarle a confirmar desde su correo.', chipClass: 'status-chip status-pending' },
          };
          const summaryCounters = document.querySelectorAll('[data-summary]');
          const history = document.getElementById('scan-history');
          const statusText = document.getElementById('scan-status');
          const statusBadge = document.getElementById('scan-result-badge');
          const form = document.getElementById('scan-form');
          const codeInput = document.getElementById('scan-code');
          const eventInput = document.getElementById('scan-event');
          const fillerButtons = document.querySelectorAll('button[data-code]');
          let totals = { valid: 0, duplicate: 0, invalid: 0, pending: 0 };

          fillerButtons.forEach((button) => {
            button.addEventListener('click', () => {
              const code = button.getAttribute('data-code');
              if (code) {
                codeInput.value = code;
                codeInput.focus();
              }
            });
          });

          function formatTime(date = new Date()) {
            return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          }

          function updateSummary() {
            summaryCounters.forEach((node) => {
              const key = node.getAttribute('data-summary');
              if (key && Object.prototype.hasOwnProperty.call(totals, key)) {
                node.textContent = String(totals[key]);
              }
            });
          }

          function appendHistory({ code, eventId, status }) {
            const row = document.createElement('tr');
            const statusInfo = STATUS_LABELS[status] ?? STATUS_LABELS.invalid;
            row.innerHTML = \`
              <td>\${formatTime()}</td>
              <td>\${code}</td>
              <td>\${eventId}</td>
              <td><span class="\${statusInfo.chipClass}">\${statusInfo.text.split('.')[0]}</span></td>
            \`;
            row.tabIndex = 0;
            if (history.firstElementChild && history.firstElementChild.dataset.placeholder !== 'false') {
              history.innerHTML = '';
            }
            history.prepend(row);
          }

          form.addEventListener('submit', (event) => {
            event.preventDefault();
            const rawCode = codeInput.value.trim();
            const code = rawCode.toUpperCase();
            if (!code) {
              codeInput.focus();
              return;
            }
            const eventId = eventInput.value.trim() || 'demo-event';
            const status = SAMPLE_CODES.get(code) || 'invalid';
            totals[status] = (totals[status] ?? 0) + 1;
            const statusInfo = STATUS_LABELS[status] ?? STATUS_LABELS.invalid;
            statusBadge.className = statusInfo.chipClass;
            statusBadge.textContent = statusInfo.text.split('.')[0];
            statusText.innerHTML = \`
              <strong>\${statusInfo.text}</strong>
              <br />
              \${statusInfo.description}
            \`;
            appendHistory({ code, eventId, status });
            updateSummary();
            form.reset();
            codeInput.focus();
          });
        })();
      </script>
    </body>
  </html>`;
}

function log(payload) {
  console.log(JSON.stringify(payload));
}
