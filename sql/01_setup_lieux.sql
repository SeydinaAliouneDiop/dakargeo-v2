-- ============================================================
-- DakarGeo v2 — 01_setup_lieux.sql
-- À exécuter dans Supabase : SQL Editor → New Query → Run
-- ============================================================

-- PostGIS est déjà activé sur Supabase, mais au cas où :
CREATE EXTENSION IF NOT EXISTS postgis;

-- Table des lieux d'intérêt
DROP TABLE IF EXISTS lieux;
CREATE TABLE lieux (
    id          SERIAL PRIMARY KEY,
    nom         TEXT NOT NULL,
    type        TEXT NOT NULL,
    description TEXT,
    adresse     TEXT,
    geom        GEOMETRY(Point, 4326)
);

INSERT INTO lieux (nom, type, description, adresse, geom) VALUES
('Hôpital Principal de Dakar',    'hôpital',   'Hôpital public de référence nationale',        'Avenue Nelson Mandela, Dakar',       ST_SetSRID(ST_MakePoint(-17.4416, 14.6835), 4326)),
('Hôpital Le Dantec',             'hôpital',   'CHU spécialisé en cancérologie',               'Avenue Pasteur, Dakar',              ST_SetSRID(ST_MakePoint(-17.4497, 14.6762), 4326)),
('Hôpital de Fann',               'hôpital',   'CHU neurologie et maladies infectieuses',      'Route de Fann, Dakar',               ST_SetSRID(ST_MakePoint(-17.4605, 14.6930), 4326)),
('Hôpital Aristide Le Dantec',    'hôpital',   'Maternité et pédiatrie',                       'Plateau, Dakar',                     ST_SetSRID(ST_MakePoint(-17.4480, 14.6770), 4326)),
('Hôpital Général de Grand Yoff', 'hôpital',   'Hôpital général de la banlieue',               'Grand Yoff, Dakar',                  ST_SetSRID(ST_MakePoint(-17.4529, 14.7310), 4326)),
('Université Cheikh Anta Diop',   'école',     'Plus grande université du Sénégal (UCAD)',     'Route de la Corniche, Dakar',        ST_SetSRID(ST_MakePoint(-17.4674, 14.6928), 4326)),
('Lycée Lamine Guèye',            'école',     'Lycée public historique de Dakar',             'Place de l Indépendance, Dakar',     ST_SetSRID(ST_MakePoint(-17.4423, 14.6787), 4326)),
('ESP — École Sup. Polytechnique','école',     'Génie civil, informatique, télécom',           'UCAD, Dakar',                        ST_SetSRID(ST_MakePoint(-17.4651, 14.6915), 4326)),
('Institut Supérieur de Gestion', 'école',     'École de commerce ISG',                        'Mermoz, Dakar',                      ST_SetSRID(ST_MakePoint(-17.4820, 14.7050), 4326)),
('Marché Sandaga',                'marché',    'Grand marché central de Dakar',                'Avenue Émile Badiane, Dakar',        ST_SetSRID(ST_MakePoint(-17.4392, 14.6809), 4326)),
('Marché HLM',                    'marché',    'Marché du tissu et de la mode',                'HLM, Dakar',                         ST_SetSRID(ST_MakePoint(-17.4560, 14.7040), 4326)),
('Marché Tilène',                 'marché',    'Marché alimentaire et artisanat',              'Médina, Dakar',                      ST_SetSRID(ST_MakePoint(-17.4530, 14.6870), 4326)),
('Marché Kermel',                 'marché',    'Marché colonial rénové',                       'Plateau, Dakar',                     ST_SetSRID(ST_MakePoint(-17.4446, 14.6788), 4326)),
('Marché Colobane',               'marché',    'Marché de l occasion et friperie',             'Colobane, Dakar',                    ST_SetSRID(ST_MakePoint(-17.4622, 14.7028), 4326)),
('Grande Mosquée de Dakar',       'mosquée',   'Mosquée nationale, Plateau',                   'Avenue du Président Lamine Guèye',   ST_SetSRID(ST_MakePoint(-17.4437, 14.6831), 4326)),
('Mosquée Massalikul Jinaan',     'mosquée',   'Plus grande mosquée d Afrique de l Ouest',     'Colobane, Dakar',                    ST_SetSRID(ST_MakePoint(-17.4630, 14.7038), 4326)),
('Mosquée Omarienne',             'mosquée',   'Mosquée de la confrérie Tijaniyya',            'Médina, Dakar',                      ST_SetSRID(ST_MakePoint(-17.4520, 14.6862), 4326)),
('Pharmacie Guigon',              'pharmacie', 'Pharmacie centrale du Plateau',                'Rue Vincens, Dakar',                 ST_SetSRID(ST_MakePoint(-17.4410, 14.6810), 4326)),
('Pharmacie de la Médina',        'pharmacie', 'Pharmacie de quartier Médina',                 'Avenue Blaise Diagne, Dakar',        ST_SetSRID(ST_MakePoint(-17.4548, 14.6895), 4326)),
('Pharmacie Point E',             'pharmacie', 'Pharmacie quartier résidentiel',               'Point E, Dakar',                     ST_SetSRID(ST_MakePoint(-17.4720, 14.6965), 4326)),
('Monument de la Renaissance',    'culture',   'Statue colossale sur colline de Mamelles',     'Mamelles, Dakar',                    ST_SetSRID(ST_MakePoint(-17.4945, 14.7300), 4326)),
('Musée IFAN',                    'culture',   'Musée des arts africains',                     'Place Soweto, Dakar',                ST_SetSRID(ST_MakePoint(-17.4460, 14.6840), 4326)),
('Village des Arts',              'culture',   'Centre artistique contemporain',               'Cambérène, Dakar',                   ST_SetSRID(ST_MakePoint(-17.4385, 14.7440), 4326));

-- Index GIN (recherche texte)
CREATE INDEX idx_lieux_nom_gin  ON lieux USING GIN (to_tsvector('french', nom));
-- Index GiST (recherche spatiale KNN)
CREATE INDEX idx_lieux_geom_gist ON lieux USING GIST (geom);
CREATE INDEX idx_lieux_type      ON lieux (type);
