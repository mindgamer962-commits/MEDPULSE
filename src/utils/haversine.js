/**
 * Calculates the great-circle distance between two points on the Earth's surface using the Haversine formula.
 * @param {number} lat1 Latitude of first point
 * @param {number} lon1 Longitude of first point
 * @param {number} lat2 Latitude of second point
 * @param {number} lon2 Longitude of second point
 * @returns {number|null} Distance in kilometers, or null if any coordinate is missing or invalid.
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const isValidCoord = (val, min, max) => {
    return typeof val === 'number' && !isNaN(val) && val >= min && val <= max;
  };

  if (!isValidCoord(lat1, -90, 90) || 
      !isValidCoord(lon1, -180, 180) || 
      !isValidCoord(lat2, -90, 90) || 
      !isValidCoord(lon2, -180, 180)) {
    return null;
  }

  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km

  return Number(d.toFixed(1));
}
