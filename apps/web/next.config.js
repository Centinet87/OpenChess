//@ts-check

const apiUrl = process.env.API_URL ?? 'http://localhost:3333';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // El navegador solo habla con el dominio del front; Next reenvía /api/* a la API.
  // Así las cookies httpOnly quedan en el mismo sitio y no hace falta CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

module.exports = nextConfig;
