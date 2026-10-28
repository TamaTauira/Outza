/** Single source of truth for the Outza map look (Map page + every detail-page map). */
export const MAP_TILE = (dark: boolean) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${dark ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'}/MapServer/tile/{z}/{y}/{x}`
export const MAP_ATTRIBUTION = 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors'
export const MAP_MAX_ZOOM = 16
