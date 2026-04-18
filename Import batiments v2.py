"""
DakarGeo v2 — Import bâtiments vers PostgreSQL/PostGIS
Fonctionne avec Supabase OU Neon (auto-détection)
"""
import geopandas as gpd
import psycopg2
from psycopg2.extras import execute_values
from shapely.geometry import MultiPolygon
from shapely.wkt import dumps as wkt_dumps
import sys, socket



SUPABASE_URL = "postgresql://postgres:uWmK2uwTvmmrJdZd@db.esgvshorazjjnxnibkth.supabase.co:5432/postgres"

NEON_URL = "postgresql://neondb_owner:npg_STZ4JBK8yMjz@ep-cool-bonus-abiqqr49-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require"

SHP_PATH = "BATIMENTS_DAKAR.shp"


BATCH = 2000


def parse_url(url):
    """Parse une DATABASE_URL en dict psycopg2"""
    import re
    m = re.match(r'postgresql://([^:]+):([^@]+)@([^:/]+):?(\d*)/([^?]+)', url)
    if not m:
        raise ValueError(f"URL invalide: {url}")
    return {
        "user":     m.group(1),
        "password": m.group(2),
        "host":     m.group(3),
        "port":     int(m.group(4)) if m.group(4) else 5432,
        "dbname":   m.group(5),
        "sslmode":  "require"
    }

def test_host(host, port=5432, timeout=5):
    """Teste si le host est joignable"""
    try:
        socket.setdefaulttimeout(timeout)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((host, port))
        s.close()
        return True
    except:
        return False

def get_zone(geom):
    cx = geom.centroid.x
    if cx < -17.45:  return "Dakar Centre"
    elif cx < -17.40: return "Plateau / Medina"
    elif cx < -17.35: return "Parcelles Assainies"
    elif cx < -17.30: return "Guediawaye"
    elif cx < -17.25: return "Pikine"
    else:             return "Rufisque / Peripherie"

def get_classe(s):
    if s < 25:    return "< 25 m2"
    elif s < 50:   return "25-50 m2"
    elif s < 100:  return "50-100 m2"
    elif s < 200:  return "100-200 m2"
    elif s < 500:  return "200-500 m2"
    elif s < 1000: return "500-1000 m2"
    else:          return "> 1000 m2"


print("=" * 55)
print("  DakarGeo v2 — Import batiments")
print("=" * 55)

db_config = None

if SUPABASE_URL:
    cfg = parse_url(SUPABASE_URL)
    print(f"\nTest connexion Supabase ({cfg['host']})...")
    if test_host(cfg['host'], cfg['port']):
        print("  Host joignable, tentative de connexion...")
        try:
            conn = psycopg2.connect(**cfg)
            conn.close()
            db_config = cfg
            print("  Supabase OK !")
        except Exception as e:
            print(f"  Connexion echouee: {e}")
    else:
        print("  Host NON joignable depuis ton reseau.")
        print("  --> Utilise un VPN ou passe sur Neon")


if not db_config and NEON_URL:
    cfg = parse_url(NEON_URL)
    print(f"\nTest connexion Neon ({cfg['host']})...")
    try:
        conn = psycopg2.connect(**cfg)
        conn.close()
        db_config = cfg
        print("  Neon OK !")
    except Exception as e:
        print(f"  Neon echoue aussi: {e}")

if not db_config:
    print("\n IMPOSSIBLE DE SE CONNECTER")
    print("\nSolutions :")
    print("  1. Active un VPN et relance ce script")
    print("  2. Cree un projet sur neon.tech et remplis NEON_URL")
    print("  3. Lance depuis Google Colab (voir instructions en bas)")
    sys.exit(1)

print(f"\nLecture de {SHP_PATH}...")
gdf     = gpd.read_file(SHP_PATH)
gdf_utm = gdf.copy()
gdf     = gdf.to_crs("EPSG:4326")

gdf["surface_m2"]     = gdf_utm.geometry.area.round(2)
gdf["zone_nom"]       = gdf.geometry.apply(get_zone)
gdf["classe_surface"] = gdf["surface_m2"].apply(get_classe)
print(f"  {len(gdf):,} batiments charges")

conn = psycopg2.connect(**db_config)
conn.autocommit = False
cur  = conn.cursor()

print("\nCreation de la table...")
cur.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
cur.execute("DROP TABLE IF EXISTS batiments;")
cur.execute("""
    CREATE TABLE batiments (
        ogc_fid        SERIAL PRIMARY KEY,
        surface_m2     FLOAT,
        zone_nom       TEXT,
        classe_surface TEXT,
        geom           GEOMETRY(MultiPolygon, 4326)
    );
""")
conn.commit()
print("  Table creee !")

total    = len(gdf)
inserted = 0
errors   = 0
n_batch  = (total // BATCH) + 1

print(f"\nImport de {total:,} batiments (lots de {BATCH})...")
print("-" * 55)

for i in range(n_batch):
    start = i * BATCH
    end   = min(start + BATCH, total)
    if start >= total:
        break

    batch = gdf.iloc[start:end]
    rows  = []

    for _, row in batch.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        if geom.geom_type == "Polygon":
            geom = MultiPolygon([geom])
        wkt = wkt_dumps(geom, rounding_precision=5)
        rows.append((
            float(row["surface_m2"]),
            row["zone_nom"],
            row["classe_surface"],
            f"SRID=4326;{wkt}"
        ))

    if not rows:
        continue

    try:
        execute_values(
            cur,
            "INSERT INTO batiments (surface_m2, zone_nom, classe_surface, geom) VALUES %s",
            rows,
            template="(%s, %s, %s, ST_GeomFromEWKT(%s))"
        )
        conn.commit()
        inserted += len(rows)
        pct = (inserted / total) * 100
        bar = "#" * int(pct / 2)
        print(f"  [{bar:<50}] {pct:5.1f}%  ({inserted:,}/{total:,})", end="\r")

    except Exception as e:
        conn.rollback()
        errors += 1
        print(f"\n  Erreur lot {i+1}: {e} — on continue...")
        continue

print(f"\n  Import termine : {inserted:,} inseres, {errors} erreurs")

print("\nCreation des index...")
cur.execute("CREATE INDEX IF NOT EXISTS idx_bat_geom   ON batiments USING GIST (geom);")
cur.execute("CREATE INDEX IF NOT EXISTS idx_bat_zone   ON batiments (zone_nom);")
cur.execute("CREATE INDEX IF NOT EXISTS idx_bat_classe ON batiments (classe_surface);")

print("Creation des vues statistiques...")
cur.execute("""
CREATE OR REPLACE VIEW stats_globales AS
SELECT
    COUNT(*)                                                                     AS total_batiments,
    ROUND(MIN(surface_m2)::numeric, 1)                                           AS surface_min,
    ROUND(MAX(surface_m2)::numeric, 1)                                           AS surface_max,
    ROUND(AVG(surface_m2)::numeric, 1)                                           AS surface_moy,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY surface_m2)::numeric, 1)   AS surface_mediane,
    ROUND((SUM(surface_m2) / 1000000)::numeric, 2)                               AS surface_totale_km2
FROM batiments;
""")
cur.execute("""
CREATE OR REPLACE VIEW stats_zones AS
SELECT zone_nom, COUNT(*) AS nb_batiments,
    ROUND(AVG(surface_m2)::numeric, 1) AS surface_moy,
    ROUND((SUM(surface_m2)/1000000)::numeric, 3) AS surface_totale_km2
FROM batiments WHERE zone_nom IS NOT NULL
GROUP BY zone_nom ORDER BY nb_batiments DESC;
""")
cur.execute("""
CREATE OR REPLACE VIEW stats_classes AS
SELECT classe_surface, COUNT(*) AS nb_batiments,
    ROUND(AVG(surface_m2)::numeric, 1) AS surface_moy
FROM batiments WHERE classe_surface IS NOT NULL
GROUP BY classe_surface ORDER BY MIN(surface_m2);
""")
conn.commit()


cur.execute("SELECT COUNT(*) FROM batiments;")
count = cur.fetchone()[0]
print(f"\nVerification : {count:,} batiments dans la base")

cur.execute("SELECT zone_nom, nb_batiments FROM stats_zones;")
print("\nRepartition par zone :")
for row in cur.fetchall():
    print(f"  {row[0]:<25} {row[1]:>7,} batiments")

cur.close()
conn.close()
print("\n Supabase pret pour DakarGeo v2 !")