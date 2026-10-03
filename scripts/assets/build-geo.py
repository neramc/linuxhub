#!/usr/bin/env python3
"""
Builds src/data/geo/{countries,timezones}.json used for mirror ranking.

Inputs (both public domain), downloaded to a temp dir by the caller:
  - Natural Earth 1:50m admin-0 countries (label points):
    https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip
  - IANA tz database (zone1970.tab coordinates, `backward` aliases):
    https://data.iana.org/time-zones/tzdata-latest.tar.gz

Usage: python3 scripts/assets/build-geo.py <ne_dir> <tzdata_dir>
Requires: pip install pyshp
"""
import json
import re
import sys
from pathlib import Path

import shapefile  # pyshp

ne_dir, tz_dir = Path(sys.argv[1]), Path(sys.argv[2])
out = Path(__file__).resolve().parents[2] / "src" / "data" / "geo"
out.mkdir(parents=True, exist_ok=True)

CONTINENTS = {
    "Africa": "AF", "Antarctica": "AN", "Asia": "AS", "Europe": "EU",
    "North America": "NA", "Oceania": "OC", "South America": "SA",
    "Seven seas (open ocean)": "OC",
}

countries = {}
reader = shapefile.Reader(str(ne_dir / "ne_50m_admin_0_countries"))
fields = [f[0] for f in reader.fields[1:]]
for rec in reader.records():
    r = dict(zip(fields, rec))
    cc = r["ISO_A2_EH"] if r["ISO_A2_EH"] not in ("-99", "", None) else r["ISO_A2"]
    if not cc or cc == "-99":
        continue
    countries[cc] = {
        "lat": round(float(r["LABEL_Y"]), 2),
        "lon": round(float(r["LABEL_X"]), 2),
        "continent": CONTINENTS.get(r["CONTINENT"], "OC"),
    }

def dms(s: str) -> float:
    sign = -1 if s[0] == "-" else 1
    s = s[1:]
    deg_len = 2 if len(s) in (4, 6) else 3
    d = int(s[:deg_len]); m = int(s[deg_len:deg_len + 2])
    sec = int(s[deg_len + 2:] or 0)
    return round(sign * (d + m / 60 + sec / 3600), 2)

zones = {}
for line in (tz_dir / "zone1970.tab").read_text().splitlines():
    if line.startswith("#") or not line.strip():
        continue
    codes, coord, name = line.split("\t")[:3]
    m = re.match(r"([+-]\d+)([+-]\d+)", coord)
    zones[name] = {"cc": codes.split(",")[0], "lat": dms(m.group(1)), "lon": dms(m.group(2))}

# Per-country zones from zone.tab give a better country for shared zones (e.g. Europe/Zurich).
for line in (tz_dir / "zone.tab").read_text().splitlines():
    if line.startswith("#") or not line.strip():
        continue
    cc, coord, name = line.split("\t")[:3]
    m = re.match(r"([+-]\d+)([+-]\d+)", coord)
    zones.setdefault(name, {"cc": cc, "lat": dms(m.group(1)), "lon": dms(m.group(2))})

for line in (tz_dir / "backward").read_text().splitlines():
    parts = line.split()
    if len(parts) >= 3 and parts[0] == "Link" and parts[1] in zones:
        zones.setdefault(parts[2], zones[parts[1]])

(out / "countries.json").write_text(json.dumps(dict(sorted(countries.items())), separators=(",", ":")) + "\n")
(out / "timezones.json").write_text(json.dumps(dict(sorted(zones.items())), separators=(",", ":")) + "\n")
print(f"{len(countries)} countries, {len(zones)} zones")
