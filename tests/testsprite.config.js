module.exports = {
  project: 'Monotickets E2E',
  output: {
    junit: {
      dir: './reports/junit',
      file: '[suite]-results.xml',
    },
    allure: {
      dir: './reports/allure',
    },
    coverage: {
      dir: './coverage',
    },
    artifacts: {
      dir: './tests/artifacts',
    },
  },
  suites: {
    confirmations: {
      specs: [
        'tests/e2e_guest/**/*.{spec,test}.{js,ts,jsx,tsx}',
        'tests/e2e_guest/**/*.feature',
      ],
      tags: ['@confirm'],
    },
    scanner: {
      specs: [
        'tests/e2e_staff/**/*.{spec,test}.{js,ts,jsx,tsx}',
        'tests/e2e_staff/**/*.feature',
      ],
      tags: ['@scan', '@error', '@critical'],
    },
    scan_validate: {
      specs: ['tests/e2e_staff/scan-validate.spec.ts'],
      tags: ['@scan', '@error', '@critical'],
    },
    whatsapp_flows: {
      specs: [
        'tests/e2e_organizer/**/*.{spec,test}.{js,ts,jsx,tsx}',
        'tests/e2e_organizer/**/*.feature',
      ],
      tags: ['@wa', '@organizer', '@cross-browser'],
    },
    organizer_matrix: {
      specs: ['tests/e2e_organizer/organizer-workflows.spec.ts'],
      tags: ['@organizer', '@cross-browser'],
    },
    delivery: {
      specs: ['tests/e2e_delivery/**/*.{spec,test}.{js,ts,jsx,tsx}'],
      tags: ['@wa', '@delivery', '@window'],
    },
    wa_window: {
      specs: ['tests/e2e_delivery/wa-session-window.spec.ts'],
      tags: ['@wa', '@delivery', '@window'],
    },
    director: {
      specs: ['tests/e2e_director/**/*.{spec,test}.{js,ts,jsx,tsx}'],
      tags: ['@director', '@kpi', '@cross-browser'],
    },
  },
  runner: {
    name: 'playwright',
    timeout: parseInt(process.env.TEST_TIMEOUT || '300000', 10),
    headless: process.env.HEADLESS !== '0',
    env: {
      BASE_URL_FRONTEND:
        process.env.BASE_URL_FRONTEND || 'http://frontend:3001',
      BASE_URL_BACKEND: process.env.BASE_URL_BACKEND || 'http://backend:3000',
      WA_WEBHOOK_URL:
        process.env.WA_WEBHOOK_URL || 'http://backend:3000/wa/webhook',
      CI: process.env.CI || '1',
    },
  },
};
