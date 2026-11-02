export const environment = {
  production: true,
  // Same site as the web files, so a new domain needs no rebuild.
  API_URL: '/api/v1',
  // The /design-lab playground is a dev tool; never reachable in production.
  designLab: false,
};
