"""
EchoVision — OSRM Routing Service

Uses OpenStreetMap Nominatim for geocoding and the open-source OSRM
router for driving-distance calculation.

Features:
  - Location-biased geocoding: searches near the user's current location first
  - State/region-aware: extracts region from current_location to disambiguate places
  - Returns None if geocoding fails so the caller can ask clarifying questions
"""

import httpx
import logging
import re

logger = logging.getLogger(__name__)


def _extract_region_from_address(address: str) -> str | None:
    """Try to extract a state/region name from an address string like 'Mohammadpur Gujar, Haryana'."""
    # Common Indian states for matching
    indian_states = [
        "Haryana", "Delhi", "Rajasthan", "Punjab", "Uttar Pradesh",
        "Maharashtra", "Gujarat", "Tamil Nadu", "Karnataka", "West Bengal",
        "Bihar", "Madhya Pradesh", "Kerala", "Andhra Pradesh", "Telangana",
        "Odisha", "Jharkhand", "Assam", "Uttarakhand", "Himachal Pradesh",
        "Goa", "Chhattisgarh", "Jammu and Kashmir", "Manipur", "Meghalaya",
        "Mizoram", "Nagaland", "Sikkim", "Tripura", "Arunachal Pradesh",
    ]
    for state in indian_states:
        if state.lower() in address.lower():
            return state
    return None


async def geocode_address(address: str, near_location: str = "") -> tuple[float, float] | None:
    """
    Uses OSM Nominatim to convert an address string to (latitude, longitude).
    
    If `near_location` is provided, we extract the region/state from it and 
    append it to the query to bias the search towards the user's area.
    """
    try:
        headers = {"User-Agent": "EchoVision-Accessibility-App/1.0"}
        
        # Strategy 1: Try with region bias from user's current location
        region = _extract_region_from_address(near_location) if near_location else None
        
        queries_to_try = []
        
        # Avoid redundancy: if region is already in the address, don't double append
        has_region = region and region.lower() in address.lower()
        
        if region and not has_region:
            queries_to_try.append(f"{address}, {region}, India")
            queries_to_try.append(f"{address}, {region}")
            
        queries_to_try.append(f"{address}, India")
        queries_to_try.append(address)
        
        # Fallback: if address has commas, try just the first part (most specific local name)
        if "," in address:
            first_part = address.split(",")[0].strip()
            if region and region.lower() not in first_part.lower():
                queries_to_try.append(f"{first_part}, {region}, India")
            queries_to_try.append(f"{first_part}, India")
            queries_to_try.append(first_part)
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            for query in queries_to_try:
                params = {"q": query, "format": "json", "limit": 1}
                resp = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params=params,
                    headers=headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data and len(data) > 0:
                        lat, lon = float(data[0]["lat"]), float(data[0]["lon"])
                        display = data[0].get("display_name", "")
                        logger.info(f"📍 Geocoded '{query}' → {lat},{lon} ({display})")
                        return lat, lon
        
        logger.warning(f"📍 Geocoding failed for all attempts: {address}")
        return None
    except Exception as e:
        logger.error(f"Geocoding error for {address}: {e}")
        return None


async def get_route_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> dict | None:
    """
    Uses public OSRM API to get driving distance + duration.
    Returns {"distance_km": float, "duration_min": float} or None.
    """
    try:
        url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=false"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if "routes" in data and len(data["routes"]) > 0:
                    route = data["routes"][0]
                    return {
                        "distance_km": route["distance"] / 1000.0,
                        "duration_min": route["duration"] / 60.0,
                    }
        return None
    except Exception as e:
        logger.error(f"OSRM routing error: {e}")
        return None


async def calculate_distance_between_addresses(
    start_address: str, end_address: str
) -> dict | None:
    """
    Geocode both addresses and fetch OSRM distance.
    Uses start_address as location bias for end_address geocoding.
    
    Returns {"distance_km": float, "duration_min": float} or None.
    """
    start_coords = await geocode_address(start_address)
    if not start_coords:
        return None
    
    # Use the start address for region-biased geocoding of the destination
    end_coords = await geocode_address(end_address, near_location=start_address)
    if not end_coords:
        return None
    
    return await get_route_distance(
        start_coords[0], start_coords[1],
        end_coords[0], end_coords[1],
    )


async def calculate_distance_from_coords(
    start_lat: float, start_lon: float, end_address: str, near_location: str = ""
) -> dict | None:
    """
    Geocode the destination address and fetch OSRM distance directly from the given starting coordinates.
    """
    end_coords = await geocode_address(end_address, near_location=near_location)
    if not end_coords:
        return None
    
    return await get_route_distance(
        start_lat, start_lon,
        end_coords[0], end_coords[1],
    )
