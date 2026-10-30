//@ts-check

// Un solo .env para todo el workspace.
require('dotenv').config({
  path: require('path').join(__dirname, '../../.env'),
  quiet: true,
});

const apiUrl = process.env.API_URL ?? 'http://localhost:3333';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // En desarrollo cada club es un subdominio de APP_DOMAIN (p. ej. miclub.openchess.localhost).
  allowedDevOrigins: [
    process.env.APP_DOMAIN ?? 'localhost',
    `*.${process.env.APP_DOMAIN ?? 'localhost'}`,
  ],
  // Solo lo que el navegador necesita saber. Nada secreto aquí: queda en el bundle.
  env: {
    NEXT_PUBLIC_APP_DOMAIN: process.env.APP_DOMAIN ?? 'localhost',
    // Vacío en desarrollo: el cliente usa el mismo host que la página, puerto de la API.
    NEXT_PUBLIC_WS_URL: process.env.WS_URL ?? '',
  },
  // El navegador solo habla con el dominio del front; Next reenvía /api/* a la API.
  // Así las cookies httpOnly quedan en el mismo sitio y no hace falta CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

module.exports = nextConfig;
